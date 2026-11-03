/**
 * Scanner photos: each active student's HMS face photo and whether every face
 * machine (roster sync on) has it; "use profile photo" one at a time or for
 * everyone without a photo; the photo endpoint, access, and the student view.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest"
import sharp from "sharp"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createStudentProfile } from "../../helpers/seed/students.js"
import { fileAccessService } from "../../../src/services/storage/file-access.service.js"
import { storageClient } from "../../../src/services/storage/storage.client.js"
import { configOwner } from "../../../src/services/config/configOwner.service.js"
import { DiningScannerUser, IclockDevice, IclockDeviceUser } from "../../../src/models/index.js"
import { derivePhotoStatus, machineState, PROFILE_JOB_CONFIG_KEY } from "../../../src/services/dining/scanner-users.service.js"

const BASE = "/api/v1/dining-scanner-users"

let seq = 0
const tag = `SP${Date.now().toString(36).slice(-4)}`.toUpperCase()
const roll = () => `${tag}${String(++seq).padStart(3, "0")}`

const files = new Map()
const image = (width, height, format = "png") =>
  sharp({ create: { width, height, channels: 3, background: { r: 100, g: 80, b: 70 } } })[format]().toBuffer()
const putFile = (buffer) => {
  const ref = `media://sp-${files.size + 1}`
  files.set(ref, buffer)
  return ref
}

const machines = []
beforeAll(async () => {
  await setupTestDb()
  // Two machines with roster sync on, last seen long ago (so a nudge doesn't queue anything).
  for (const alias of ["m2", "m3"]) {
    const sn = `${tag}SN${alias}`
    await IclockDevice.create({ sn, alias, lastSeenAt: new Date(Date.now() - 86400_000), sync: { enabled: true, seededAt: new Date() } })
    machines.push(sn)
  }
})
afterAll(teardownTestDb)
beforeEach(() => {
  vi.spyOn(storageClient, "upload").mockImplementation(async ({ file }) => ({ file_ref: putFile(file.buffer) }))
  vi.spyOn(fileAccessService, "getBuffer").mockImplementation(async (ref) => {
    if (!files.has(ref)) throw new Error("missing")
    return { buffer: files.get(ref), contentType: "image/jpeg" }
  })
})
afterEach(() => vi.restoreAllMocks())

const makeStudent = async ({ name = "Photo Student", profileImage = "", status = "Active" } = {}) => {
  const user = await seed.student({ name, ...(profileImage ? { profileImage } : {}) })
  const rollNumber = roll()
  await createStudentProfile({ userId: user._id, rollNumber, status })
  return { user, rollNumber }
}

const giveFace = (rollNumber, sha) =>
  DiningScannerUser.create({ rollNumber, face: { ref: `media://face-${sha}`, contentType: "image/jpeg", sha256: sha, source: "request", storedAt: new Date() } })

const hold = (snIndex, pin, set) => IclockDeviceUser.create({ sn: machines[snIndex], pin, ...set })

const listFor = async (api, query = {}) => (await api.get(BASE).query({ search: tag, limit: 100, ...query })).body.data

describe("status rules", () => {
  it("reads one machine's state for the current photo", () => {
    expect(machineState({ onMachine: true, faceSha: "a" }, "a")).toBe("ok")
    expect(machineState({ onMachine: true, faceSha: "old" }, "a")).toBe("waiting")
    expect(machineState({ onMachine: true, faceSha: "a", pending: { op: "face" } }, "a")).toBe("waiting")
    expect(machineState({ onMachine: true, faceSha: "", lastResult: { ok: false, faceSha: "a" } }, "a")).toBe("refused")
    expect(machineState({ onMachine: true, faceSha: "", lastResult: { ok: false, faceSha: "old" } }, "a")).toBe("waiting")
    expect(machineState(undefined, "a")).toBe("waiting")
  })

  it("derives the overall status", () => {
    expect(derivePhotoStatus("", [])).toBe("missing")
    expect(derivePhotoStatus("a", ["ok", "ok"])).toBe("valid")
    expect(derivePhotoStatus("a", ["ok", "waiting"])).toBe("pending")
    expect(derivePhotoStatus("a", ["ok", "refused"])).toBe("failed")
  })
})

describe("list", () => {
  it("shows active students with their photo and each machine's state", async () => {
    const none = await makeStudent({ name: "No Photo" })
    const working = await makeStudent({ name: "Working" })
    const sending = await makeStudent({ name: "Sending" })
    const refused = await makeStudent({ name: "Refused" })
    const errored = await makeStudent({ name: "Machine Error" })
    const graduated = await makeStudent({ name: "Graduated", status: "Graduated" })
    await giveFace(working.rollNumber, "w1")
    await hold(0, working.rollNumber, { onMachine: true, faceSha: "w1" })
    await hold(1, working.rollNumber, { onMachine: true, faceSha: "w1" })
    await giveFace(sending.rollNumber, "s1")
    await hold(0, sending.rollNumber, { onMachine: true, faceSha: "s1" })
    await giveFace(refused.rollNumber, "r1")
    await hold(0, refused.rollNumber, { onMachine: true, faceSha: "r1" })
    await hold(1, refused.rollNumber, { onMachine: true, faceSha: "", lastResult: { op: "face", ok: false, code: -12, faceSha: "r1" } })
    await giveFace(errored.rollNumber, "e1")
    await hold(0, errored.rollNumber, { onMachine: true, faceSha: "", lastResult: { op: "face", ok: false, code: 0, faceSha: "e1", error: "D01E0001", message: "The machine couldn't make a face from this photo" } })
    await hold(1, errored.rollNumber, { onMachine: true, faceSha: "e1" })
    await giveFace(graduated.rollNumber, "g1")

    const api = await as(await seed.admin())
    const data = await listFor(api)
    const byRoll = Object.fromEntries(data.items.map((item) => [item.rollNumber, item]))
    expect(byRoll[graduated.rollNumber]).toBeUndefined()
    expect(byRoll[none.rollNumber]).toMatchObject({ name: "No Photo", photoStatus: "missing", photo: { present: false } })
    expect(byRoll[working.rollNumber]).toMatchObject({ photoStatus: "valid", photo: { present: true, source: "request", sourceLabel: "Student upload" } })
    expect(byRoll[working.rollNumber].machines).toEqual([
      { alias: "m2", state: "ok", refusal: null },
      { alias: "m3", state: "ok", refusal: null },
    ])
    expect(byRoll[sending.rollNumber]).toMatchObject({ photoStatus: "pending", machines: [{ alias: "m2", state: "ok" }, { alias: "m3", state: "waiting" }] })
    expect(byRoll[refused.rollNumber]).toMatchObject({
      photoStatus: "failed",
      machines: [{ alias: "m2", state: "ok" }, { alias: "m3", state: "refused", refusal: { code: "-12", message: "The machine didn't accept this photo" } }],
    })
    // Took the photo (Return=0), then reported it couldn't use it: the machine's error is shown.
    expect(byRoll[errored.rollNumber]).toMatchObject({
      photoStatus: "failed",
      machines: [{ alias: "m2", state: "refused", refusal: { code: "D01E0001", message: "The machine couldn't make a face from this photo" } }, { alias: "m3", state: "ok", refusal: null }],
    })
    expect(data.counts).toMatchObject({ valid: expect.any(Number), missing: expect.any(Number) })
    expect(data.machines).toEqual(["m2", "m3"])

    expect((await listFor(api, { status: "failed" })).items.map((item) => item.rollNumber).sort()).toEqual([refused.rollNumber, errored.rollNumber].sort())
    expect((await listFor(api, { search: working.rollNumber })).items.map((item) => item.rollNumber)).toEqual([working.rollNumber])
    expect((await api.get(BASE).query({ status: "notInHms" })).status).toBe(400)
  })
})

describe("use profile photo", () => {
  it("saves a usable profile photo as a JPEG face and records the try", async () => {
    const student = await makeStudent({ profileImage: putFile(await image(900, 1200)) })
    const api = await as(await seed.admin())
    const res = await api.post(`${BASE}/${student.rollNumber}/profile-photo`)
    expect(res.status).toBe(200)
    expect(res.body.data.outcome).toBe("sent")
    expect(res.body.data.item).toMatchObject({ photoStatus: "pending", photo: { present: true, source: "profile" } })
    const row = await DiningScannerUser.findOne({ rollNumber: student.rollNumber }).lean()
    expect(row.face).toMatchObject({ contentType: "image/jpeg", source: "profile" })
    expect(row.profileAttempt.outcome).toBe("sent")
  })

  it("records an unusable or missing profile photo without changing the face", async () => {
    const api = await as(await seed.admin())
    const small = await makeStudent({ profileImage: putFile(await image(120, 120)) })
    let res = await api.post(`${BASE}/${small.rollNumber}/profile-photo`)
    expect(res.body.data).toMatchObject({ outcome: "unusable", item: { photoStatus: "missing", profileAttempt: { outcome: "unusable" } } })
    expect(res.body.message).toMatch(/too small/)

    const without = await makeStudent()
    res = await api.post(`${BASE}/${without.rollNumber}/profile-photo`)
    expect(res.body.message).toBe("No profile photo in HMS.")
    expect((await api.post(`${BASE}/NOSUCHROLL/profile-photo`)).status).toBe(404)
  })

  it("keeps a photo that works everywhere unless asked to replace it", async () => {
    const student = await makeStudent({ profileImage: putFile(await image(600, 600)) })
    await giveFace(student.rollNumber, "keep")
    await hold(0, student.rollNumber, { onMachine: true, faceSha: "keep" })
    await hold(1, student.rollNumber, { onMachine: true, faceSha: "keep" })
    const api = await as(await seed.admin())
    expect((await api.post(`${BASE}/${student.rollNumber}/profile-photo`)).status).toBe(409)
    const res = await api.post(`${BASE}/${student.rollNumber}/profile-photo`).send({ replace: true })
    expect(res.status).toBe(200)
    expect(res.body.data.item.photoStatus).toBe("pending")
  })

  it("bulk: tries everyone without a photo who has a profile photo, once", async () => {
    await configOwner.upsertConfig({ key: PROFILE_JOB_CONFIG_KEY }, { key: PROFILE_JOB_CONFIG_KEY, value: { running: false } })
    const good = await makeStudent({ profileImage: putFile(await image(700, 700)) })
    const bad = await makeStudent({ profileImage: putFile(await image(100, 100)) })
    const api = await as(await seed.admin())
    const res = await api.post(`${BASE}/profile-photos`)
    expect(res.status).toBe(202)
    let job
    for (let i = 0; i < 50; i++) {
      job = (await listFor(api)).profileJob
      if (job && !job.running) break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(job).toMatchObject({ running: false })
    expect(job.sent).toBeGreaterThanOrEqual(1)
    expect((await DiningScannerUser.findOne({ rollNumber: good.rollNumber }).lean()).face.source).toBe("profile")
    expect((await DiningScannerUser.findOne({ rollNumber: bad.rollNumber }).lean()).profileAttempt.outcome).toBe("unusable")
    // Everyone has been tried now.
    expect((await api.post(`${BASE}/profile-photos`)).status).toBe(400)
  })
})

describe("photo + access", () => {
  it("streams the stored face for staff and 404s without one", async () => {
    const student = await makeStudent({ profileImage: putFile(await image(500, 500)) })
    const admin = await as(await seed.admin())
    await admin.post(`${BASE}/${student.rollNumber}/profile-photo`)
    const response = await admin.get(`${BASE}/${student.rollNumber}/photo`)
    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toMatch(/image\/jpeg/)
    expect(response.headers["cache-control"]).toMatch(/private/)
    expect((await admin.get(`${BASE}/NOPHOTO1/photo`)).status).toBe(404)
  })

  it("allows Admin and Dining Office only, and has no add or sync", async () => {
    const admin = await as(await seed.admin())
    expect((await admin.get(BASE)).status).toBe(200)
    expect((await (await as(await seed.createUser({ role: "Dining", subRole: "Office" }))).get(BASE)).status).toBe(200)
    expect((await (await as(await seed.createUser({ role: "Dining", subRole: "Caterer" }))).get(BASE)).status).toBe(403)
    expect((await (await as(await seed.student())).get(BASE)).status).toBe(403)
    const denied = await seed.createUser({ role: "Dining", subRole: "Office", authz: { override: { denyRoutes: ["route.admin.diningScannerUsers"] } } })
    expect((await (await as(denied)).get(BASE)).status).toBe(403)
    expect((await admin.post(BASE).send({ rollNumber: "X" })).status).toBe(404)
    expect((await admin.post(`${BASE}/sync`)).status).toBe(404)
  })
})

describe("student view", () => {
  it("tells the student how many machines have their photo", async () => {
    const student = await makeStudent()
    const api = await as(student.user)
    let view = (await api.get("/api/v1/students/dining/bio-photo")).body.data.scanner
    expect(view).toMatchObject({ status: "missing", machines: { total: 2, accepted: 0 } })

    await giveFace(student.rollNumber, "mine")
    await hold(0, student.rollNumber, { onMachine: true, faceSha: "mine" })
    view = (await api.get("/api/v1/students/dining/bio-photo")).body.data.scanner
    expect(view).toMatchObject({ status: "pending", machines: { total: 2, accepted: 1, waiting: 1, rejected: 0 } })

    await hold(1, student.rollNumber, { onMachine: true, faceSha: "mine" })
    view = (await api.get("/api/v1/students/dining/bio-photo")).body.data.scanner
    expect(view).toMatchObject({ status: "valid", machines: { accepted: 2 } })
  })
})
