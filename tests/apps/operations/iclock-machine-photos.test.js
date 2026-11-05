/**
 * Photo checks — fetching back what a face machine holds (DATA QUERY USERINFO
 * PIN=…) and comparing it with the HMS photo. The machine side is simulated
 * with the uploads a SpeedFace-V5L sent on 2026-11-03 (captured).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import os from "node:os"
import crypto from "node:crypto"
import path from "node:path"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createIclockApp } from "../../../src/apps/iclock/iclock.app.js"
import { iclockOwner } from "../../../src/services/iclock/iclockOwner.service.js"
import {
  istClock,
  photoCheckResult,
  planNightlyChecks,
  recentlySent,
  requestPhotoCheck,
  runDuePhotoChecks,
  PHOTO_CHECKS_IN_FLIGHT,
  RECENT_SEND_DELAY_MS,
} from "../../../src/services/iclock/machine-photos.service.js"
import { DiningScannerUser, IclockCommand, IclockDeviceUser, StudentProfile } from "../../../src/models/index.js"

let app
let seq = 0
const uniq = () => `${Date.now().toString(36)}${++seq}`.toUpperCase()
const jpeg = (label) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(label)])
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex")

beforeAll(async () => {
  process.env.ICLOCK_MACHINE_PHOTO_DIR = path.join(os.tmpdir(), `iclock-photos-${uniq()}`)
  await setupTestDb()
  await iclockOwner.ensureIndexes()
  app = createIclockApp()
})
afterAll(teardownTestDb)

const machine = async ({ sync = false } = {}) => {
  const sn = `PSN${uniq()}`
  await iclockOwner.createDevice({ sn })
  await request(app).get(`/iclock/ping?SN=${sn}`)
  if (sync) await iclockOwner.updateDevice(sn, { "sync.enabled": true })
  return sn
}

/** Active student with an HMS face whose bytes are `bytes`. */
const student = async (bytes = jpeg(`face-${uniq()}`)) => {
  const rollNumber = `P${uniq()}`
  const user = await seed.student({ name: `Student ${rollNumber}` })
  await StudentProfile.create({ userId: user._id, rollNumber, status: "Active" })
  await DiningScannerUser.create({ rollNumber, name: `Student ${rollNumber}`, face: { ref: `media://face-${rollNumber}`, contentType: "image/jpeg", sha256: sha(bytes), source: "request" } })
  return { rollNumber, faceSha: sha(bytes), bytes }
}

const post = (sn, table, body) => request(app).post(`/iclock/cdata?SN=${sn}&table=${table}&Stamp=9999`).set("Content-Type", "text/plain").send(body)

/** What the machine sends for DATA QUERY USERINFO PIN=… (face: send a Type=9 face record). */
const machineAnswers = async (sn, pin, { photo = null, face = true } = {}) => {
  const commands = (await request(app).get(`/iclock/getrequest?SN=${sn}`)).text.trim().split("\n")
  const line = commands.find((c) => c.includes(`DATA QUERY USERINFO PIN=${pin}`))
  expect(line).toBeTruthy()
  const id = Number(line.split(":")[1])
  if (photo) {
    await post(sn, "OPERLOG", `USER PIN=${pin}\tName=Test\tPri=0\tPasswd=\tCard=\tGrp=1\n`)
    await post(sn, "BIODATA", `BIODATA Pin=${pin}\tNo=6\tIndex=0\tValid=1\tDuress=0\tType=1\tMajorVer=13\tMinorVer=0\tFormat=0\tTmp=AAAA\n${face ? `BIODATA Pin=${pin}\tNo=0\tIndex=0\tValid=1\tDuress=0\tType=9\tMajorVer=36\tMinorVer=1\tFormat=0\tTmp=BBBB\n` : ""}`)
    await post(sn, "OPERLOG", `USERPIC PIN=${pin}\tFileName=${pin}.jpg\tSize=4\tContent=${jpeg("screen").toString("base64")}\n`)
    await post(sn, "OPERLOG", `BIOPHOTO PIN=${pin}\tNo=0\tIndex=0\tFileName=${pin}.jpg\tType=9\tSize=${photo.length}\tContent=${photo.toString("base64")}\n`)
  }
  await request(app).post(`/iclock/devicecmd?SN=${sn}`).set("Content-Type", "text/plain").send(`ID=${id}&Return=0&CMD=DATA`)
}

const row = (sn, pin) => IclockDeviceUser.findOne({ sn, pin }).lean()

describe("rules", () => {
  it("reads IST night and weekday", () => {
    expect(istClock(Date.parse("2026-11-07T19:10:00Z"))).toEqual({ date: "2026-11-08", minutes: 40, weekday: "Sun" })
  })

  it("plans changed or never-checked people, everyone on a full night, and skips photos in flight", () => {
    const wanted = new Map([
      ["A", { pin: "A", faceSha: "a" }],
      ["B", { pin: "B", faceSha: "b2" }],
      ["C", { pin: "C", faceSha: "c" }],
      ["D", { pin: "D", faceSha: "d" }],
    ])
    const rows = [
      { pin: "A", check: { requestedAt: new Date(), faceSha: "a" } }, // checked, unchanged
      { pin: "B", check: { requestedAt: new Date(), faceSha: "b1" } }, // photo changed since
      { pin: "D", pending: { op: "face" } },
    ]
    expect(planNightlyChecks({ rows, wanted, full: false })).toEqual(["B", "C"])
    expect(planNightlyChecks({ rows, wanted, full: true })).toEqual(["A", "B", "C"])
  })

  it("finds photos HMS just sent that haven't been fetched back", () => {
    const now = Date.now()
    const sent = (ago, extra = {}) => ({ pin: `p${ago}`, lastResult: { op: "face", ok: true, at: new Date(now - ago) }, ...extra })
    const rows = [
      sent(RECENT_SEND_DELAY_MS + 1000),
      sent(1000), // too fresh: the machine is still making the face
      sent(2 * RECENT_SEND_DELAY_MS, { check: { requestedAt: new Date(now) } }), // already checked since
      { pin: "x", lastResult: { op: "face", ok: false, at: new Date(now - 2 * RECENT_SEND_DELAY_MS) } },
    ]
    expect(recentlySent({ rows, now }).map((r) => r.pin)).toEqual([`p${RECENT_SEND_DELAY_MS + 1000}`])
  })

  it("reads a check result", () => {
    const asked = new Date("2026-11-03T17:00:00Z")
    const after = new Date("2026-11-03T17:00:01Z")
    const before = new Date("2026-11-03T16:00:00Z")
    const base = { check: { requestedAt: asked, answeredAt: after } }
    expect(photoCheckResult({}, "s").status).toBe("none")
    expect(photoCheckResult({ check: { requestedAt: asked } }, "s", asked.getTime() + 1000).status).toBe("checking")
    expect(photoCheckResult({ check: { requestedAt: asked } }, "s", asked.getTime() + 3600_000).status).toBe("noAnswer")
    expect(photoCheckResult({ ...base, machinePhoto: { at: after, sha256: "s" }, faceTemplateAt: after }, "s").status).toBe("match")
    expect(photoCheckResult({ ...base, machinePhoto: { at: after, sha256: "s" }, faceTemplateAt: before }, "s").status).toBe("noFace")
    expect(photoCheckResult({ ...base, machinePhoto: { at: after, sha256: "other" }, faceTemplateAt: after }, "s").status).toBe("different")
    expect(photoCheckResult({ ...base, machinePhoto: { at: before, sha256: "s" } }, "s").status).toBe("noPhoto")
  })
})

describe("checks through the receiver", () => {
  it("the machine's photo is saved and matched with HMS's, with its face record", async () => {
    const sn = await machine()
    const { rollNumber, faceSha, bytes } = await student()
    await requestPhotoCheck(sn, rollNumber, { faceSha })
    await machineAnswers(sn, rollNumber, { photo: bytes })
    const r = await row(sn, rollNumber)
    expect(r.check.answeredAt).toBeTruthy()
    expect(r.machinePhoto.sha256).toBe(faceSha)
    expect(photoCheckResult(r, faceSha)).toMatchObject({ status: "match", face: true, same: true })
  })

  it("no face record, a different photo, or nothing at all", async () => {
    const sn = await machine()
    const noFace = await student()
    await requestPhotoCheck(sn, noFace.rollNumber, { faceSha: noFace.faceSha })
    await machineAnswers(sn, noFace.rollNumber, { photo: noFace.bytes, face: false })
    expect(photoCheckResult(await row(sn, noFace.rollNumber), noFace.faceSha).status).toBe("noFace")

    const other = await student()
    await requestPhotoCheck(sn, other.rollNumber, { faceSha: other.faceSha })
    await machineAnswers(sn, other.rollNumber, { photo: jpeg("an older photo") })
    expect(photoCheckResult(await row(sn, other.rollNumber), other.faceSha).status).toBe("different")

    const absent = await student()
    await requestPhotoCheck(sn, absent.rollNumber, { faceSha: absent.faceSha })
    await machineAnswers(sn, absent.rollNumber, { photo: null })
    expect(photoCheckResult(await row(sn, absent.rollNumber), absent.faceSha).status).toBe("noPhoto")
  })

  it("plans the night once and trickles at most PHOTO_CHECKS_IN_FLIGHT per machine", async () => {
    const sn = await machine({ sync: true })
    const night = Date.parse("2026-11-04T19:10:00Z") // 00:40 IST, Thursday
    await iclockOwner.updateDevice(sn, { lastSeenAt: new Date(night) })
    const people = []
    for (let i = 0; i < 3; i++) people.push(await student())

    const first = await runDuePhotoChecks({ now: night })
    expect(first[sn].planned).toBeGreaterThanOrEqual(3)
    expect(first[sn].queued).toBeLessThanOrEqual(PHOTO_CHECKS_IN_FLIGHT)
    const asked = await IclockCommand.find({ sn, "ref.kind": "photo-query" }).lean()
    expect(asked.length).toBe(first[sn].queued)
    for (const person of people) {
      const r = await row(sn, person.rollNumber)
      expect(Boolean(r.check.requestedAt) || r.check.wanted).toBe(true)
    }

    // Same night again: nothing new planned.
    const again = await runDuePhotoChecks({ now: night + 2 * 60_000 })
    expect(again[sn].planned).toBe(0)
  })
})

describe("Scanner Photos page", () => {
  it("fetch from machines, then the machine's photo is shown next to the check result", async () => {
    const sn = await machine({ sync: true })
    const { rollNumber, faceSha, bytes } = await student()
    const api = await as(await seed.admin())

    expect((await api.get(`/api/v1/dining-scanner-users/${rollNumber}/machine-photo`).query({ machine: sn })).status).toBe(404)
    const res = await api.post(`/api/v1/dining-scanner-users/${rollNumber}/machine-check`)
    expect(res.status).toBe(202)
    const mine = res.body.data.item.machines.find((m) => m.sn === sn)
    expect(mine.check.status).toBe("checking")

    await machineAnswers(sn, rollNumber, { photo: bytes })
    const list = (await api.get("/api/v1/dining-scanner-users").query({ search: rollNumber })).body.data
    const entry = list.items[0].machines.find((m) => m.sn === sn)
    expect(entry.check).toMatchObject({ status: "match", face: true })
    expect(faceSha).toBe(sha(bytes))

    const image = await api.get(`/api/v1/dining-scanner-users/${rollNumber}/machine-photo`).query({ machine: sn }).buffer(true).parse((r, cb) => {
      const chunks = []
      r.on("data", (c) => chunks.push(c))
      r.on("end", () => cb(null, Buffer.concat(chunks)))
    })
    expect(image.status).toBe(200)
    expect(image.headers["content-type"]).toBe("image/jpeg")
    expect(Buffer.from(image.body).equals(bytes)).toBe(true)
  })
})
