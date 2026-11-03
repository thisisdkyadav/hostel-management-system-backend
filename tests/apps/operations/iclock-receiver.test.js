/**
 * iclock receiver (ZKTeco PUSH protocol): the request/answer shapes captured
 * from the real SpeedFace-V5L machines, shadow vs live punches, dedupe of
 * re-sent batches, the old-punch guard, and the command queue round trip.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import request from "supertest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { seed } from "../../helpers/seed.js"
import { createIclockApp } from "../../../src/apps/iclock/iclock.app.js"
import { clearIclockCaches } from "../../../src/services/iclock/iclock.service.js"
import { iclockOwner } from "../../../src/services/iclock/iclockOwner.service.js"
import {
  bioPhotoCommand,
  parseAttlog,
  parseDeviceCmdResults,
  parseOptions,
  userInfoCommand,
} from "../../../src/services/iclock/protocol.js"
import * as models from "../../../src/models/index.js"

const { Caterer, DiningAllocation, DiningMealVerification, DiningPeriod, FaceScanner, IclockCommand, IclockDevice, IclockPunch, StudentProfile } = models

let app
beforeAll(async () => {
  await setupTestDb()
  await iclockOwner.ensureIndexes()
  app = createIclockApp()
})
afterAll(async () => {
  await teardownTestDb()
})

const pad2 = (n) => String(n).padStart(2, "0")
const machineTime = (d) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
let snSeq = 0
const newSn = () => `TESTSN${Date.now().toString(36)}${++snSeq}`.toUpperCase()

const post = (path, body) => request(app).post(path).set("User-Agent", "iClock Proxy/1.09").set("Content-Type", "text/plain").send(body)
const get = (path) => request(app).get(path).set("User-Agent", "iClock Proxy/1.09")

async function diningFixture() {
  const user = await seed.createUser({ role: "Dining", subRole: "Caterer", name: `Iclock Foods ${newSn()}` })
  const caterer = await Caterer.create({ name: `Iclock Foods ${newSn()}`, email: `iclock-${newSn().toLowerCase()}@hms.test`, userId: user._id })
  const period = await DiningPeriod.create({
    startDate: new Date(Date.now() - 86400e3),
    endDate: new Date(Date.now() + 86400e3),
    catererIds: [caterer._id],
    mealSlots: [{ name: "All Day Meal", startTime: "00:00", endTime: "23:59" }],
  })
  const student = await seed.student()
  const profile = await StudentProfile.create({
    userId: student._id,
    rollNumber: `IC${Date.now().toString(36)}${snSeq}`.toUpperCase(),
    degree: "B.Tech",
    department: "CSE",
    gender: "Male",
    status: "Active",
  })
  await DiningAllocation.create({
    periodId: period._id, studentUserId: student._id, studentProfileId: profile._id, rollNumber: profile.rollNumber, catererId: caterer._id,
  })
  const scanner = await FaceScanner.create({
    name: "Mess machine", username: `ic-${newSn().toLowerCase()}`, passwordHash: "x", type: "dining-meal", direction: "in", catererId: caterer._id,
  })
  return { caterer, profile, scanner }
}

describe("iclock protocol parsing", () => {
  it("parses ATTLOG lines and rejects junk without throwing", () => {
    const { punches, rejected } = parseAttlog("2301\t2026-11-03 12:01:05\t0\t15\t0\t0\t0\t0\t0\t0\r\nnot a punch\n\n")
    expect(punches).toHaveLength(1)
    expect(punches[0]).toMatchObject({ pin: "2301", localTime: "2026-11-03 12:01:05", status: "0", verify: "15" })
    expect(rejected).toEqual(["not a punch"])
  })

  it("parses devicecmd results exactly as the machines send them", () => {
    expect(parseDeviceCmdResults("ID=53383&Return=0&CMD=DATA\nID=53385&Return=-1001&CMD=DATA\n")).toEqual([
      { id: 53383, returnCode: 0, cmd: "DATA", extra: {} },
      { id: 53385, returnCode: -1001, cmd: "DATA", extra: {} },
    ])
  })

  it("parses the options upload", () => {
    const o = parseOptions("~DeviceName=SpeedFace-V5L,UserCount=4206,FaceCount=4035,FWVersion=ZAM230-NF50VA-Ver1.1.9,PushVersion=Ver 3.1.6S-20251028")
    expect(o).toMatchObject({ DeviceName: "SpeedFace-V5L", UserCount: "4206", FaceCount: "4035", PushVersion: "Ver 3.1.6S-20251028" })
  })

  it("formats commands byte-for-byte like EasyWDMS", () => {
    expect(userInfoCommand({ pin: "2101131012", name: "Amiy Krishna" })).toBe(
      "DATA USER PIN=2101131012\tName=Amiy Krishna\tPri=0\tPasswd=\tCard=\t\tGrp=1\tVerify=-1\tExpires=0",
    )
    expect(bioPhotoCommand({ pin: "2101131012", url: "iclock/file/biophoto/abc/2101131012.jpg" })).toBe(
      "DATA UPDATE BIOPHOTO PIN=2101131012\tType=9\tFormat=1\tUrl=iclock/file/biophoto/abc/2101131012.jpg",
    )
  })
})

describe("iclock receiver", () => {
  it("answers idle polls and pings with OK and registers the machine in shadow mode", async () => {
    const sn = newSn()
    const poll = await get(`/iclock/getrequest?SN=${sn}`)
    expect(poll.status).toBe(200)
    expect(poll.text).toBe("OK")
    expect((await get(`/iclock/ping?SN=${sn}`)).text).toBe("OK")
    const device = await IclockDevice.findOne({ sn }).lean()
    expect(device).toMatchObject({ sn, mode: "shadow" })
  })

  it("stores the options upload on the machine", async () => {
    const sn = newSn()
    const res = await post(`/iclock/cdata?SN=${sn}&table=options`, "~DeviceName=SpeedFace-V5L,UserCount=12,FaceCount=10")
    expect(res.text).toBe("OK\n")
    const device = await IclockDevice.findOne({ sn }).lean()
    expect(device.info.options).toMatchObject({ DeviceName: "SpeedFace-V5L", UserCount: "12" })
  })

  it("answers the handshake with option lines", async () => {
    const sn = newSn()
    const res = await get(`/iclock/cdata?SN=${sn}&options=all&pushver=3.1.6`)
    expect(res.text.startsWith(`GET OPTION FROM: ${sn}\nStamp=9999\nOpStamp=9999\n`)).toBe(true)
    expect(res.text).toContain("\nTimeZone=330\n") // minutes, not hours
    expect(res.text.endsWith("PushOptionsFlag=1\n")).toBe(true)
  })

  it("400s without SN", async () => {
    expect((await get("/iclock/getrequest")).status).toBe(400)
  })

  it("shadow machine: records punches, creates no meal record, dedupes a re-sent batch", async () => {
    const { profile, scanner } = await diningFixture()
    const sn = newSn()
    await get(`/iclock/ping?SN=${sn}`)
    await IclockDevice.updateOne({ sn }, { $set: { faceScannerId: scanner._id } })
    const body = `${profile.rollNumber}\t${machineTime(new Date())}\t0\t15\t0\t0\t0\t0\t0\t0\n`

    const first = await post(`/iclock/cdata?SN=${sn}&table=ATTLOG&Stamp=100`, body)
    expect(first.text).toBe("OK:1\n")
    const again = await post(`/iclock/cdata?SN=${sn}&table=ATTLOG&Stamp=100`, body)
    expect(again.text).toBe("OK:1\n")

    const punches = await IclockPunch.find({ sn }).lean()
    expect(punches).toHaveLength(1)
    expect(punches[0].outcome).toMatchObject({ processed: false, reason: "shadow" })
    expect(await DiningMealVerification.countDocuments({ rollNumber: profile.rollNumber })).toBe(0)
    expect((await IclockDevice.findOne({ sn }).lean()).stamps.ATTLOG).toBe("100")
  })

  it("live machine: a fresh punch becomes a meal record in-process; an old one is only stored", async () => {
    const { profile, scanner } = await diningFixture()
    const sn = newSn()
    await get(`/iclock/ping?SN=${sn}`)
    await IclockDevice.updateOne({ sn }, { $set: { faceScannerId: scanner._id, mode: "live" } })
    clearIclockCaches()

    const old = new Date(Date.now() - 2 * 3600e3)
    const body = [
      `${profile.rollNumber}\t${machineTime(old)}\t0\t15\t0\t0\t0\t0\t0\t0`,
      `${profile.rollNumber}\t${machineTime(new Date())}\t0\t15\t0\t0\t0\t0\t0\t0`,
    ].join("\n")
    const res = await post(`/iclock/cdata?SN=${sn}&table=ATTLOG`, body)
    expect(res.text).toBe("OK:2\n")

    const punches = await IclockPunch.find({ sn }).sort({ punchedAt: 1 }).lean()
    expect(punches.map((p) => p.outcome.reason)).toEqual(["too-old", ""])
    expect(punches[1].outcome).toMatchObject({ processed: true, success: true })
    expect(await DiningMealVerification.countDocuments({ rollNumber: profile.rollNumber })).toBe(1)
  })

  it("live but unlinked machine: stored as unlinked", async () => {
    const sn = newSn()
    await get(`/iclock/ping?SN=${sn}`)
    await IclockDevice.updateOne({ sn }, { $set: { mode: "live" } })
    await post(`/iclock/cdata?SN=${sn}&table=ATTLOG`, `999\t${machineTime(new Date())}\t0\t15\t0\n`)
    expect((await IclockPunch.findOne({ sn }).lean()).outcome.reason).toBe("unlinked")
  })

  it("command queue: queued → sent on poll → done/failed from devicecmd", async () => {
    const sn = newSn()
    await get(`/iclock/ping?SN=${sn}`)
    const a = await iclockOwner.queueCommand({ sn, command: userInfoCommand({ pin: "1", name: "A" }) })
    const b = await iclockOwner.queueCommand({ sn, command: bioPhotoCommand({ pin: "1", url: "iclock/file/biophoto/x/1.jpg" }) })
    expect([a.commandId, b.commandId]).toEqual([1, 2])

    const poll = await get(`/iclock/getrequest?SN=${sn}`)
    expect(poll.text).toBe(`C:1:${a.command}\nC:2:${b.command}\n`)
    expect((await get(`/iclock/getrequest?SN=${sn}`)).text).toBe("OK") // not re-sent

    await post(`/iclock/devicecmd?SN=${sn}`, "ID=1&Return=0&CMD=DATA\nID=2&Return=-1001&CMD=DATA\n")
    const commands = await IclockCommand.find({ sn }).sort({ commandId: 1 }).lean()
    expect(commands.map((c) => [c.status, c.returnCode])).toEqual([["done", 0], ["failed", -1001]])
  })
})
