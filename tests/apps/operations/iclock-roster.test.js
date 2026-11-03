/**
 * Roster sync — machines hold exactly the active students with an HMS face.
 * Drives the real receiver (getrequest / devicecmd / cdata) like a machine would.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createIclockApp } from "../../../src/apps/iclock/iclock.app.js"
import { iclockOwner } from "../../../src/services/iclock/iclockOwner.service.js"
import { planRoster, runRosterSync, STALE_AFTER_MS } from "../../../src/services/iclock/roster.service.js"
import { faceToken } from "../../../src/services/dining/scanner-faces.service.js"
import { DiningScannerUser, IclockCommand, IclockDeviceUser, StudentProfile } from "../../../src/models/index.js"

let app
let seq = 0
const uniq = () => `${Date.now().toString(36)}${++seq}`.toUpperCase()
const BASE = "/api/v1/face-scanner/machines"

beforeAll(async () => {
  await setupTestDb()
  await iclockOwner.ensureIndexes()
  app = createIclockApp()
})
afterAll(teardownTestDb)

const machine = async () => {
  const sn = `RSN${uniq()}`
  await request(app).get(`/iclock/ping?SN=${sn}`)
  return sn
}

/** An HMS student; `face` gives them a stored JPEG face, `onScanner` puts them in EasyWDMS's list. */
const student = async ({ status = "Active", face = true, onScanner = false, png = false } = {}) => {
  const rollNumber = `R${uniq()}`
  const user = await seed.student({ name: `Student ${rollNumber}` })
  await StudentProfile.create({ userId: user._id, rollNumber, status })
  if (face || onScanner) {
    await DiningScannerUser.create({
      rollNumber,
      name: `Student ${rollNumber}`,
      onScanner,
      bioPhoto: { present: onScanner && face },
      face: face ? { ref: `media://face-${rollNumber}`, contentType: png ? "image/png" : "image/jpeg", sha256: `sha-${rollNumber}`, source: "easywdms" } : {},
    })
  }
  return rollNumber
}

/** One machine poll: the commands it receives, as { id, command }. */
const poll = async (sn) => {
  const res = await request(app).get(`/iclock/getrequest?SN=${sn}`)
  if (res.text === "OK") return []
  return res.text
    .trim()
    .split("\n")
    .map((line) => {
      const [, id, ...rest] = line.split(":")
      return { id: Number(id), command: rest.join(":") }
    })
}

/** Poll until the queue is empty, answering every command with `code` (or codeFor(cmd)). */
const drain = async (sn, codeFor = () => 0) => {
  const seen = []
  for (let round = 0; round < 200; round++) {
    const commands = await poll(sn)
    if (!commands.length) break
    seen.push(...commands)
    const body = commands.map((c) => `ID=${c.id}&Return=${codeFor(c)}&CMD=DATA`).join("\n")
    await request(app).post(`/iclock/devicecmd?SN=${sn}`).set("Content-Type", "text/plain").send(body)
  }
  return seen
}

const forPin = (commands, pin) => commands.filter((c) => new RegExp(`PIN=${pin}(\\t|$)`).test(c.command)).map((c) => c.command)
const row = (sn, pin) => IclockDeviceUser.findOne({ sn, pin }).lean()

describe("planRoster", () => {
  const wanted = new Map([
    ["A", { pin: "A", name: "a", faceSha: "s1" }],
    ["B", { pin: "B", name: "b", faceSha: "s2" }],
    ["C", { pin: "C", name: "c", faceSha: "s3" }],
  ])
  const status = new Map([["A", "Active"], ["B", "Active"], ["C", "Active"], ["D", "Graduated"], ["E", "Active"]])
  const rows = [
    { pin: "B", onMachine: true, faceSha: "old" }, // photo changed
    { pin: "C", onMachine: true, faceSha: "s3", pending: { op: "face" } }, // in flight → left alone
    { pin: "D", onMachine: true, faceSha: "x", source: "easywdms" }, // graduated → remove
    { pin: "E", onMachine: true, faceSha: "", source: "easywdms" }, // active, no HMS photo → keep
    { pin: "STAFF1", onMachine: true, source: "machine" }, // not a student → not managed
    { pin: "GONE", onMachine: true, source: "hms" }, // HMS added, no longer wanted → remove
  ]

  it("adds, re-photos, removes only people HMS knows, and never removes an active student", () => {
    const plan = planRoster({ rows, wanted, status })
    expect(plan.add.map((p) => p.pin)).toEqual(["A"])
    expect(plan.face.map((p) => p.pin)).toEqual(["B"])
    expect(plan.remove.map((p) => p.pin).sort()).toEqual(["D", "GONE"])
    expect(plan).toMatchObject({ unmanaged: 1, inFlight: 1, onMachine: 6 })
  })
})

describe("roster sync through the receiver", () => {
  it("seeds from EasyWDMS, adds only who's missing, and follows the machine's answers", async () => {
    const sn = await machine()
    const already = await student({ onScanner: true }) // EasyWDMS already put them (and their photo) on the machine
    const fresh = await student() // active, HMS face, not on the machine
    const noFace = await student({ face: false })
    const pngOnly = await student({ png: true })
    const graduated = await student({ status: "Graduated", onScanner: true })

    const api = await as(await seed.admin())
    const enabled = await api.patch(`${BASE}/${sn}`).send({ sync: true })
    expect(enabled.status).toBe(200)
    expect(enabled.body.data.machines.find((m) => m.sn === sn).sync.enabled).toBe(true)
    expect(await row(sn, already)).toMatchObject({ onMachine: true, source: "easywdms", faceSha: `sha-${already}` })

    const preview = await api.get(`${BASE}/${sn}/roster`)
    expect(preview.status).toBe(200)
    expect(preview.body.data.preview.samples.add.map((p) => p.pin)).toContain(fresh)
    expect(preview.body.data.preview.samples.add.map((p) => p.pin)).not.toContain(already)

    const synced = await api.post(`${BASE}/${sn}/roster/sync`).send({})
    expect(synced.status).toBe(200)
    expect(synced.body.data.result.queued.add).toBeGreaterThanOrEqual(1)

    const sent = await drain(sn)
    expect(forPin(sent, fresh)).toEqual([
      `DATA USER PIN=${fresh}\tName=Student ${fresh}\tPri=0\tPasswd=\tCard=\t\tGrp=1\tVerify=-1\tExpires=0`,
      `DATA UPDATE BIOPHOTO PIN=${fresh}\tType=9\tFormat=1\tUrl=iclock/file/biophoto/${faceToken(fresh, `media://face-${fresh}`)}/${fresh}.jpg`,
    ])
    expect(forPin(sent, already)).toEqual([])
    expect(forPin(sent, noFace)).toEqual([])
    expect(forPin(sent, pngOnly)).toEqual([]) // machines can't take PNG yet
    expect(forPin(sent, graduated)).toEqual([`DATA DELETE USERINFO PIN=${graduated}`])

    expect(await row(sn, fresh)).toMatchObject({ onMachine: true, source: "hms", faceSha: `sha-${fresh}`, pending: { op: "" } })
    expect(await row(sn, graduated)).toMatchObject({ onMachine: false, faceSha: "" })

    // Nothing left to do.
    await runRosterSync(sn)
    expect(forPin(await drain(sn), fresh)).toEqual([])

    // Deactivated → removed; reactivated → added back from the photo HMS kept.
    await StudentProfile.updateOne({ rollNumber: fresh }, { $set: { status: "Inactive" } })
    await runRosterSync(sn)
    expect(forPin(await drain(sn), fresh)).toEqual([`DATA DELETE USERINFO PIN=${fresh}`])
    await StudentProfile.updateOne({ rollNumber: fresh }, { $set: { status: "Active" } })
    await runRosterSync(sn)
    expect(forPin(await drain(sn), fresh).map((c) => c.split(" PIN")[0])).toEqual(["DATA USER", "DATA UPDATE BIOPHOTO"])

    // New photo in HMS → only the photo is re-sent.
    await DiningScannerUser.updateOne({ rollNumber: fresh }, { $set: { "face.ref": `media://new-${fresh}`, "face.sha256": `sha2-${fresh}` } })
    await runRosterSync(sn)
    expect(forPin(await drain(sn), fresh)).toEqual([
      `DATA UPDATE BIOPHOTO PIN=${fresh}\tType=9\tFormat=1\tUrl=iclock/file/biophoto/${faceToken(fresh, `media://new-${fresh}`)}/${fresh}.jpg`,
    ])
    expect((await row(sn, fresh)).faceSha).toBe(`sha2-${fresh}`)
  })

  it("a rejected photo is recorded as a failure and planned again next run", async () => {
    const sn = await machine()
    const api = await as(await seed.admin())
    await api.patch(`${BASE}/${sn}`).send({ sync: true })
    const pin = await student()
    await runRosterSync(sn)
    await drain(sn, (c) => (c.command.includes(`BIOPHOTO PIN=${pin}\t`) ? -12 : 0))
    expect(await row(sn, pin)).toMatchObject({ onMachine: true, faceSha: "", lastResult: { op: "face", ok: false, code: -12 }, pending: { op: "" } })
    const roster = await api.get(`${BASE}/${sn}/roster`)
    expect(roster.body.data.failures.map((f) => f.pin)).toContain(pin)

    await runRosterSync(sn)
    expect(forPin(await drain(sn), pin).map((c) => c.split(" PIN")[0])).toEqual(["DATA UPDATE BIOPHOTO"])
  })

  it("holds back a large removal until an admin confirms", async () => {
    const sn = await machine()
    const api = await as(await seed.admin())
    await api.patch(`${BASE}/${sn}`).send({ sync: true })
    const gone = []
    for (let i = 0; i < 55; i++) gone.push(`G${uniq()}`)
    await StudentProfile.insertMany(gone.map((rollNumber) => ({ userId: new mongoose.Types.ObjectId(), rollNumber, status: "Dropped" })))
    await iclockOwner.seedRoster(sn, gone.map((pin) => ({ pin, source: "easywdms" })))

    const held = await runRosterSync(sn)
    expect(held.removalsHeld).toBeGreaterThanOrEqual(55)
    expect(held.queued.remove).toBe(0)
    const whileHeld = await drain(sn)
    expect(gone.flatMap((pin) => forPin(whileHeld, pin))).toEqual([])

    const confirmed = await api.post(`${BASE}/${sn}/roster/sync`).send({ allowRemovals: true })
    expect(confirmed.body.data.result.queued.remove).toBeGreaterThanOrEqual(55)
    const sent = await drain(sn)
    for (const pin of gone) expect(forPin(sent, pin)).toEqual([`DATA DELETE USERINFO PIN=${pin}`])
  })

  it("people the machine reports are recorded, and someone who isn't a student is never removed", async () => {
    const sn = await machine()
    const api = await as(await seed.admin())
    await api.patch(`${BASE}/${sn}`).send({ sync: true })
    const staff = `STAFF${uniq()}`
    const read = await api.post(`${BASE}/${sn}/roster/read`).send({})
    expect(read.status).toBe(202)
    expect((await poll(sn)).map((c) => c.command)).toContain("DATA QUERY USERINFO")

    await request(app).post(`/iclock/cdata?SN=${sn}&table=OPERLOG`).set("Content-Type", "text/plain").send(`USER PIN=${staff}\tName=Mess Staff\tPri=0\tPasswd=\tCard=\tGrp=1`)
    expect(await row(sn, staff)).toMatchObject({ onMachine: true, source: "machine", name: "Mess Staff" })
    await runRosterSync(sn)
    expect(forPin(await drain(sn), staff)).toEqual([])
  })

  it("commands a machine never answers are failed after a while and the person is planned again", async () => {
    const sn = await machine()
    const api = await as(await seed.admin())
    await api.patch(`${BASE}/${sn}`).send({ sync: true })
    const pin = await student()
    await runRosterSync(sn)
    await poll(sn) // taken, never answered
    expect((await row(sn, pin)).pending.op).toBe("add")

    const later = Date.now() + STALE_AFTER_MS + 60_000
    const result = await runRosterSync(sn, { now: later })
    expect(result.unanswered).toBeGreaterThan(0)
    const old = await IclockCommand.find({ sn, "ref.key": pin, result: "no answer" }).lean()
    expect(old.length).toBe(2)
    expect((await row(sn, pin)).pending.op).toBe("add") // re-queued
  })

  it("pushes and removes one person by hand", async () => {
    const sn = await machine()
    const api = await as(await seed.admin())
    const pin = await student()
    expect((await api.post(`${BASE}/${sn}/roster/people`).send({ rollNumber: pin })).status).toBe(202)
    expect((await api.post(`${BASE}/${sn}/roster/people`).send({ rollNumber: "NOBODY" })).status).toBe(400)
    expect(forPin(await drain(sn), pin).map((c) => c.split(" PIN")[0])).toEqual(["DATA USER", "DATA UPDATE BIOPHOTO"])
    expect((await api.delete(`${BASE}/${sn}/roster/people/${pin}`)).status).toBe(202)
    expect(forPin(await drain(sn), pin)).toEqual([`DATA DELETE USERINFO PIN=${pin}`])
    expect((await row(sn, pin)).onMachine).toBe(false)
  })
})
