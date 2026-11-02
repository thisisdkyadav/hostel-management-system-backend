/**
 * Face-scanner users: nightly/manual sync from EasyWDMS (client stubbed), the
 * list + counts, add-by-roll, "use profile photo", the photo proxy and access.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from "vitest"
import Redis from "ioredis"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createStudentProfile } from "../../helpers/seed/students.js"
import { fileAccessService } from "../../../src/services/storage/file-access.service.js"
import { EasyWdmsClient, setEasyWdmsClient } from "../../../src/services/easywdms/easywdms.client.js"
import { DiningScannerUser } from "../../../src/models/index.js"
import {
  derivePhotoStatus,
  latestDeviceResults,
  refreshRecentScannerChanges,
  runDueScannerSync,
  syncScannerUsers,
} from "../../../src/services/dining/scanner-users.service.js"

const BASE = "/api/v1/dining-scanner-users"
const TERMINALS = [
  { sn: "SN2", alias: "m2" },
  { sn: "SN3", alias: "m3" },
]

const jpeg = (width, height) => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0])
  const sof = Buffer.alloc(19)
  sof.writeUInt16BE(0xffc0, 0)
  sof.writeUInt16BE(17, 2)
  sof[4] = 8
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof[9] = 3
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])])
}

let seq = 0
const roll = () => `SU${Date.now().toString(36).slice(-4)}${String(++seq).padStart(3, "0")}`.toUpperCase()
const photoRow = (code, approval = "Auto Approved") => ({ code, path: `biophoto/abc123/${code}.jpg`, approval, registeredAt: "2026-11-01 10:00:00" })
const command = (id, code, sn, ok, message = ok ? "Successful" : ok === false ? "Error: -1" : "") => ({
  id,
  code,
  sn,
  alias: TERMINALS.find((terminal) => terminal.sn === sn)?.alias || sn,
  ok,
  message,
  at: "2026-11-01 10:01:00",
})

/** In-memory EasyWDMS. */
const fakeScanner = ({ employees = [], photos = [], commands = [] } = {}) => {
  const state = { employees: [...employees], photos: [...photos], commands: [...commands], nextId: 1000 }
  const client = {
    configured: true,
    listEmployees: vi.fn(async () => state.employees.map((employee) => ({ id: employee.code, areaIds: [2], ...employee }))),
    listBioPhotos: vi.fn(async () => [...state.photos]),
    recentBioPhotos: vi.fn(async () => [...state.photos]),
    listBioPhotoCommands: vi.fn(async ({ afterId = 0 } = {}) => state.commands.filter((item) => item.id > afterId).sort((a, b) => b.id - a.id)),
    latestCommandId: vi.fn(async () => Math.max(0, ...state.commands.map((item) => item.id))),
    findEmployee: vi.fn(async (code) => state.employees.find((employee) => employee.code === code) || null),
    createEmployee: vi.fn(async ({ rollNumber, name }) => {
      state.employees.push({ code: rollNumber, name })
      return { id: rollNumber, code: rollNumber, name }
    }),
    getSetup: vi.fn(async () => ({ areaIds: [2], departmentId: 1, positionId: 1, terminals: TERMINALS })),
    importBioPhoto: vi.fn(async ({ rollNumber }) => {
      state.photos = state.photos.filter((photo) => photo.code !== rollNumber).concat(photoRow(rollNumber))
      // The machines answer at once in this fake: m2 accepts, m3 per `state.m3`.
      state.commands.push(command(++state.nextId, rollNumber, "SN2", true), command(++state.nextId, rollNumber, "SN3", state.m3 ?? true, state.m3 === false ? "Face not detected" : undefined))
      return { ok: true }
    }),
    fetchBioPhotoFile: vi.fn(async (path) => ({ buffer: Buffer.from(`photo:${path}`), contentType: "image/jpeg" })),
  }
  setEasyWdmsClient(client)
  return { client, state }
}

const makeStudent = async ({ name = "Scanner Student", profileImage } = {}) => {
  const user = await seed.student({ name, ...(profileImage ? { profileImage } : {}) })
  const rollNumber = roll()
  await createStudentProfile({ userId: user._id, rollNumber })
  return { user, rollNumber }
}

// The sync lock is cluster-wide (shared Redis); a dev server may hold it.
const clearSyncLock = async () => {
  const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379")
  await redis.del("lock:dining-scanner-sync")
  redis.disconnect()
}

beforeAll(setupTestDb)
beforeEach(clearSyncLock)
afterAll(async () => {
  setEasyWdmsClient(null)
  await teardownTestDb()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await DiningScannerUser.deleteMany({})
})

describe("status rules", () => {
  it("derives valid / pending / failed / missing", () => {
    expect(derivePhotoStatus(null, [])).toBe("missing")
    expect(derivePhotoStatus(photoRow("A"), [])).toBe("valid")
    expect(derivePhotoStatus(photoRow("A"), [{ ok: true }, { ok: true }])).toBe("valid")
    expect(derivePhotoStatus(photoRow("A"), [{ ok: true }, { ok: null }])).toBe("pending")
    expect(derivePhotoStatus(photoRow("A"), [{ ok: true }, { ok: false }])).toBe("failed")
    expect(derivePhotoStatus(photoRow("A", "Pending"), [])).toBe("pending")
    expect(derivePhotoStatus(photoRow("A", "Rejected"), [])).toBe("failed")
  })

  it("keeps only the newest answer per machine", () => {
    const results = latestDeviceResults([command(1, "A", "SN2", false), command(5, "A", "SN2", true), command(3, "A", "SN3", null)])
    expect(results.get("A")).toEqual([
      expect.objectContaining({ alias: "m2", ok: true, commandId: 5 }),
      expect.objectContaining({ alias: "m3", ok: null, commandId: 3 }),
    ])
  })
})

describe("sync + list", () => {
  it("mirrors EasyWDMS, links HMS students and counts statuses", async () => {
    const valid = await makeStudent({ name: "Valid Student" })
    const missing = await makeStudent({ name: "Missing Student" })
    const outsider = roll()
    const pending = await makeStudent({ name: "Pending Student" })
    await DiningScannerUser.create({ rollNumber: "GONE001", name: "Gone", onScanner: true })
    fakeScanner({
      employees: [
        { code: valid.rollNumber, name: "valid" },
        { code: missing.rollNumber, name: "missing" },
        { code: outsider, name: "Outsider Person" },
        { code: pending.rollNumber, name: "pending" },
      ],
      photos: [photoRow(valid.rollNumber), photoRow(outsider), photoRow(pending.rollNumber)],
      commands: [
        command(10, valid.rollNumber, "SN2", true),
        command(11, valid.rollNumber, "SN3", true),
        command(12, outsider, "SN2", false),
        command(13, pending.rollNumber, "SN2", null),
      ],
    })

    const state = await syncScannerUsers({ trigger: "test" })
    expect(state).toMatchObject({ ok: true, trigger: "test", counts: { all: 4, valid: 1, missing: 1, failed: 1, pending: 1, notInHms: 1 }, removed: 1 })
    expect(await DiningScannerUser.findOne({ rollNumber: "GONE001" }).lean()).toMatchObject({ onScanner: false })

    const admin = await as(await seed.admin())
    const all = await admin.get(BASE)
    expect(all.status).toBe(200)
    expect(all.body.data.counts).toMatchObject({ all: 4, valid: 1 })
    expect(all.body.data.sync).toMatchObject({ ok: true, running: false })
    const row = all.body.data.items.find((item) => item.rollNumber === valid.rollNumber)
    expect(row).toMatchObject({ name: "Valid Student", inHms: true, photoStatus: "valid", devicesChecked: true })
    expect(row.devices.map((device) => device.alias)).toEqual(["m2", "m3"])
    expect(row.bioPhoto).not.toHaveProperty("path")

    const notInHms = await admin.get(BASE).query({ status: "notInHms" })
    expect(notInHms.body.data.items.map((item) => item.rollNumber)).toEqual([outsider])
    expect(notInHms.body.data.items[0]).toMatchObject({ name: "Outsider Person", photoStatus: "failed" })

    const search = await admin.get(BASE).query({ search: "missing stud" })
    expect(search.body.data.items.map((item) => item.rollNumber)).toEqual([missing.rollNumber])
    expect((await admin.get(BASE).query({ status: "bogus" })).status).toBe(400)
  })

  it("keeps earlier machine answers when the command history no longer has them", async () => {
    const student = await makeStudent()
    const { state } = fakeScanner({
      employees: [{ code: student.rollNumber, name: "x" }],
      photos: [photoRow(student.rollNumber)],
      commands: [command(20, student.rollNumber, "SN2", false)],
    })
    await syncScannerUsers()
    state.commands = []
    await syncScannerUsers()
    expect(await DiningScannerUser.findOne({ rollNumber: student.rollNumber }).lean()).toMatchObject({ photoStatus: "failed", devicesChecked: true })
  })

  it("runs nightly only from 03:00, once a day", async () => {
    fakeScanner()
    const year = 2400 + Math.floor(Math.random() * 500)
    expect(await runDueScannerSync({ now: new Date(year, 2, 5, 2, 59) })).toBeNull()
    expect(await runDueScannerSync({ now: new Date(year, 2, 5, 3, 0) })).toMatchObject({ ok: true, trigger: "nightly" })
    expect(typeof (await runDueScannerSync({ now: new Date(year, 2, 5, 9, 0) }))).toBe("symbol")
  })
})

describe("add by roll number", () => {
  it("adds HMS students, reports existing ones and refuses unknown rolls", async () => {
    const student = await makeStudent({ name: "New Scanner User" })
    const existing = await makeStudent({ name: "Old Scanner User" })
    const { client } = fakeScanner({ employees: [{ code: existing.rollNumber, name: "old" }] })
    const admin = await as(await seed.admin())

    expect((await admin.post(BASE).send({ rollNumber: "NOPE404" })).status).toBe(404)
    expect((await admin.post(BASE).send({ rollNumber: "bad roll!" })).status).toBe(400)
    expect((await admin.post(BASE).send({})).status).toBe(400)

    const added = await admin.post(BASE).send({ rollNumber: student.rollNumber.toLowerCase() })
    expect(added.status).toBe(201)
    expect(client.createEmployee).toHaveBeenCalledWith({ rollNumber: student.rollNumber, name: "New Scanner User" })
    expect(added.body.data.item).toMatchObject({ rollNumber: student.rollNumber, inHms: true, photoStatus: "missing" })
    expect((await DiningScannerUser.findOne({ rollNumber: student.rollNumber }).lean()).addedAt).toBeTruthy()

    const again = await admin.post(BASE).send({ rollNumber: existing.rollNumber })
    expect(again.status).toBe(200)
    expect(again.body.data.alreadyOnScanner).toBe(true)
    expect(client.createEmployee).toHaveBeenCalledTimes(1)
  })
})

describe("use profile photo", () => {
  it("sends a usable profile photo and records each machine's answer", async () => {
    const student = await makeStudent({ name: "Photo Student", profileImage: "media://profile-1" })
    vi.spyOn(fileAccessService, "getBuffer").mockResolvedValue({ buffer: jpeg(600, 600), contentType: "image/jpeg" })
    const { client, state } = fakeScanner({ employees: [{ code: student.rollNumber, name: "x" }] })
    state.m3 = false
    const admin = await as(await seed.admin())

    const first = await admin.post(`${BASE}/${student.rollNumber}/profile-photo`).send({})
    expect(first.status).toBe(200)
    expect(client.importBioPhoto).toHaveBeenCalledWith(expect.objectContaining({ rollNumber: student.rollNumber, contentType: "image/jpeg", overwrite: true }))
    expect(first.body.data.outcome).toBe("failed")
    expect(first.body.data.item.profileAttempt).toMatchObject({ outcome: "failed" })
    expect(first.body.data.item.profileAttempt.message).toMatch(/m3.*Face not detected/)

    state.m3 = true
    const second = await admin.post(`${BASE}/${student.rollNumber}/profile-photo`).send({})
    expect(second.body.data).toMatchObject({ outcome: "valid", item: { photoStatus: "valid", profileAttempt: { outcome: "sent" } } })

    expect((await admin.post(`${BASE}/${student.rollNumber}/profile-photo`).send({})).status).toBe(409)
    expect((await admin.post(`${BASE}/${student.rollNumber}/profile-photo`).send({ replace: true })).status).toBe(200)
  })

  it("records an unusable profile photo without touching the scanners", async () => {
    const noPhoto = await makeStudent({ name: "No Photo" })
    const tiny = await makeStudent({ name: "Tiny Photo", profileImage: "media://tiny" })
    vi.spyOn(fileAccessService, "getBuffer").mockResolvedValue({ buffer: jpeg(100, 100), contentType: "image/jpeg" })
    const { client } = fakeScanner()
    const office = await as(await seed.createUser({ role: "Dining", subRole: "Office" }))

    const none = await office.post(`${BASE}/${noPhoto.rollNumber}/profile-photo`).send({})
    expect(none.status).toBe(200)
    expect(none.body.data).toMatchObject({ outcome: "unusable", item: { profileAttempt: { outcome: "unusable", message: "No profile photo in HMS." } } })
    const small = await office.post(`${BASE}/${tiny.rollNumber}/profile-photo`).send({})
    expect(small.body.data.item.profileAttempt.message).toMatch(/can't be used/)
    expect(client.importBioPhoto).not.toHaveBeenCalled()
    expect(client.createEmployee).not.toHaveBeenCalled()
  })

  it("adds the student to the scanners first when needed", async () => {
    const student = await makeStudent({ name: "Brand New", profileImage: "media://p" })
    vi.spyOn(fileAccessService, "getBuffer").mockResolvedValue({ buffer: jpeg(400, 500), contentType: "image/jpeg" })
    const { client } = fakeScanner()
    const response = await (await as(await seed.admin())).post(`${BASE}/${student.rollNumber}/profile-photo`).send({})
    expect(response.body.data.outcome).toBe("valid")
    expect(client.createEmployee).toHaveBeenCalledTimes(1)
  })
})

describe("photo proxy + access", () => {
  it("streams the scanner photo for staff and 404s without one", async () => {
    const student = await makeStudent()
    fakeScanner({ employees: [{ code: student.rollNumber, name: "x" }], photos: [photoRow(student.rollNumber)] })
    await syncScannerUsers()
    const admin = await as(await seed.admin())
    const response = await admin.get(`${BASE}/${student.rollNumber}/photo`)
    expect(response.status).toBe(200)
    expect(response.headers["content-type"]).toMatch(/image\/jpeg/)
    expect(response.headers["cache-control"]).toMatch(/private/)
    expect((await admin.get(`${BASE}/NOPHOTO1/photo`)).status).toBe(404)
  })

  it("allows Admin and Dining Office only", async () => {
    fakeScanner()
    expect((await (await as(await seed.admin())).get(BASE)).status).toBe(200)
    expect((await (await as(await seed.createUser({ role: "Dining", subRole: "Office" }))).get(BASE)).status).toBe(200)
    expect((await (await as(await seed.createUser({ role: "Dining", subRole: "Caterer" }))).get(BASE)).status).toBe(403)
    expect((await (await as(await seed.student())).get(BASE)).status).toBe(403)
    const denied = await seed.createUser({ role: "Dining", subRole: "Office", authz: { override: { denyRoutes: ["route.admin.diningScannerUsers"] } } })
    expect((await (await as(denied)).get(BASE)).status).toBe(403)
  })
})

describe("per-minute refresh + student view", () => {
  it("picks up new photos, new answers and late answers to waiting commands", async () => {
    const a = await makeStudent({ name: "Live A" })
    const b = await makeStudent({ name: "Live B" })
    const { state } = fakeScanner({
      employees: [{ code: a.rollNumber, name: "a" }, { code: b.rollNumber, name: "b" }],
      photos: [photoRow(a.rollNumber)],
      commands: [command(100, a.rollNumber, "SN2", true), command(101, a.rollNumber, "SN3", true)],
    })
    expect(await refreshRecentScannerChanges()).toBeNull() // no full sync yet → nothing to go on
    await syncScannerUsers()

    // B gets a photo: m2 answers at once, m3 not yet.
    state.photos.push({ ...photoRow(b.rollNumber), registeredAt: "2026-11-02 10:00:00" })
    state.commands.push(command(102, b.rollNumber, "SN2", true), command(103, b.rollNumber, "SN3", null))
    expect(await refreshRecentScannerChanges()).toEqual({ updated: 1 })
    expect(await DiningScannerUser.findOne({ rollNumber: b.rollNumber }).lean()).toMatchObject({ photoStatus: "pending" })

    const student = await as(b.user)
    const waiting = await student.get("/api/v1/students/dining/bio-photo")
    expect(waiting.body.data.scanner).toMatchObject({ status: "pending", machines: { total: 2, accepted: 1, waiting: 1, rejected: 0 } })

    // m3 answers on the same command row (same id): still picked up.
    state.commands = state.commands.map((item) => (item.id === 103 ? command(103, b.rollNumber, "SN3", false, "Face not detected") : item))
    expect(await refreshRecentScannerChanges()).toEqual({ updated: 1 })
    const failed = await student.get("/api/v1/students/dining/bio-photo")
    expect(failed.body.data.scanner).toMatchObject({ status: "failed", machines: { accepted: 1, rejected: 1, waiting: 0 } })

    // Nothing new → nothing written.
    expect(await refreshRecentScannerChanges()).toEqual({ updated: 0 })

    const ready = await (await as(a.user)).get("/api/v1/students/dining/bio-photo")
    expect(ready.body.data.scanner).toMatchObject({ status: "valid", machines: { total: 2, accepted: 2 } })
  })

  it("tells a student who isn't on the scanners", async () => {
    const outsider = await makeStudent()
    fakeScanner({ employees: [] })
    await syncScannerUsers()
    const response = await (await as(outsider.user)).get("/api/v1/students/dining/bio-photo")
    expect(response.body.data.scanner).toMatchObject({ status: "notOnScanner" })
  })
})

describe("EasyWDMS client", () => {
  it("asks for an API token without the portal session cookie", async () => {
    const seen = []
    const fetchImpl = async (url, init = {}) => {
      seen.push({ url, cookie: init.headers?.Cookie || "" })
      if (url.endsWith("/api-token-auth/")) return new Response(JSON.stringify({ token: "t1" }), { status: 200 })
      return new Response(JSON.stringify({ data: [], next: null }), { status: 200 })
    }
    const client = new EasyWdmsClient({ baseUrl: "http://wdms", username: "u", password: "p", fetchImpl })
    client.jar.cookies.set("sessionid", "portal-session")
    client.jar.cookies.set("csrftoken", "csrf")
    await client.findEmployee("123")
    expect(seen[0]).toEqual({ url: "http://wdms/api-token-auth/", cookie: "" })
  })
})
