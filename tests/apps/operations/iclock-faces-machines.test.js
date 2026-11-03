/**
 * HMS-held scanner faces (stored as upright JPEGs, token-guarded download by
 * the machines) and the Face Scanners → Machines API.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import request from "supertest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createIclockApp } from "../../../src/apps/iclock/iclock.app.js"
import { iclockOwner } from "../../../src/services/iclock/iclockOwner.service.js"
import { fileAccessService } from "../../../src/services/storage/file-access.service.js"
import { storageClient } from "../../../src/services/storage/storage.client.js"
import sharp from "sharp"
import { faceToken, faceUrlFor, storeScannerFace } from "../../../src/services/dining/scanner-faces.service.js"
import { DiningScannerUser, FaceScanner, IclockDevice } from "../../../src/models/index.js"

let app
let seq = 0
const roll = () => `FC${Date.now().toString(36)}${++seq}`.toUpperCase()
const files = new Map() // storage ref -> buffer

beforeAll(async () => {
  await setupTestDb()
  await iclockOwner.ensureIndexes()
  app = createIclockApp()
})
afterAll(teardownTestDb)
afterEach(() => vi.restoreAllMocks())

const fakeStorage = () => {
  vi.spyOn(storageClient, "upload").mockImplementation(async ({ file }) => {
    const ref = `media://test-${files.size + 1}`
    files.set(ref, file.buffer)
    return { file_ref: ref }
  })
  vi.spyOn(fileAccessService, "getBuffer").mockImplementation(async (ref) => {
    if (!files.has(ref)) throw new Error("missing")
    return { buffer: files.get(ref), contentType: "image/jpeg" }
  })
}

/** A real image of the given size and format (sharp can decode it). */
const image = (width, height, format = "jpeg", options = {}) =>
  sharp({ create: { width, height, channels: 3, background: { r: 120, g: 90, b: 60 } } })[format]()
    .withMetadata(options.orientation ? { orientation: options.orientation } : {})
    .toBuffer()

describe("scanner faces", () => {
  it("stores a PNG as a JPEG the machines can use, scaled down and upright", async () => {
    fakeStorage()
    const r = roll()
    const result = await storeScannerFace({ rollNumber: r, buffer: await image(1600, 2400, "png"), source: "profile" })
    expect(result.ok).toBe(true)
    expect(result.face).toMatchObject({ contentType: "image/jpeg", width: 683, height: 1024, source: "profile" })
    const stored = files.get(result.face.ref)
    expect(stored[0]).toBe(0xff)
    expect((await sharp(stored).metadata()).format).toBe("jpeg")
    const row = await DiningScannerUser.findOne({ rollNumber: r }).lean()
    expect(faceUrlFor(row)).toContain(`/${r}.jpg`)

    // A phone photo stored sideways with an EXIF rotation comes out upright.
    const turned = await storeScannerFace({ rollNumber: r, buffer: await image(800, 600, "jpeg", { orientation: 6 }), source: "request" })
    expect(turned.face).toMatchObject({ width: 600, height: 800 })
  })

  it("refuses photos it can't use and leaves the current face alone", async () => {
    fakeStorage()
    const r = roll()
    await storeScannerFace({ rollNumber: r, buffer: await image(400, 400), source: "profile" })
    const before = (await DiningScannerUser.findOne({ rollNumber: r }).lean()).face.ref
    expect(await storeScannerFace({ rollNumber: r, buffer: await image(200, 200), source: "profile" })).toMatchObject({ ok: false, problem: expect.stringMatching(/too small/) })
    expect(await storeScannerFace({ rollNumber: r, buffer: Buffer.from("not an image at all"), source: "profile" })).toMatchObject({ ok: false })
    expect((await DiningScannerUser.findOne({ rollNumber: r }).lean()).face.ref).toBe(before)
  })

  it("machines download a face only with the right token, and the old url dies when the photo changes", async () => {
    fakeStorage()
    const r = roll()
    await storeScannerFace({ rollNumber: r, buffer: await image(480, 640), source: "request" })
    const row = await DiningScannerUser.findOne({ rollNumber: r }).lean()
    const url = faceUrlFor(row)
    expect(url).toBe(`iclock/file/biophoto/${faceToken(r, row.face.ref)}/${r}.jpg`)

    const ok = await request(app).get(`/${url}`)
    expect(ok.status).toBe(200)
    expect(ok.headers["content-type"]).toContain("image/jpeg")
    expect(Buffer.compare(ok.body, files.get(row.face.ref))).toBe(0)

    expect((await request(app).get(`/iclock/file/biophoto/${"0".repeat(32)}/${r}.jpg`)).status).toBe(404)
    expect((await request(app).get(`/iclock/file/biophoto/${faceToken(r, row.face.ref)}/SOMEONEELSE.jpg`)).status).toBe(404)

    await storeScannerFace({ rollNumber: r, buffer: await image(480, 640, "png"), source: "request" })
    expect((await request(app).get(`/${url}`)).status).toBe(404)
  })
})

describe("machines API", () => {
  const BASE = "/api/v1/face-scanner/machines"
  const machineSn = () => `MSN${Date.now().toString(36)}${++seq}`.toUpperCase()
  const post = (path, body) => request(app).post(path).set("Content-Type", "text/plain").send(body)

  it("lists what the machine reported about itself; a poll's INFO doesn't wipe the options upload", async () => {
    const sn = machineSn()
    await post(
      `/iclock/cdata?SN=${sn}&table=options`,
      "~DeviceName=SpeedFace-V5L,UserCount=4206,FaceCount=4035,~MaxFaceCount=10000,FWVersion=ZAM230-NF50VA-Ver1.1.9,PushVersion=Ver 3.1.6S-20251028,MultiBioPhotoCount=0:0:0:0:0:0:0:0:0:3585:0,IPAddress=10.230.8.111",
    )
    await request(app).get(`/iclock/getrequest?SN=${sn}&INFO=ZAM230-NF50VA-Ver1.1.9,4208,88,11369,10.230.8.111,13,36`)

    const api = await as(await seed.admin())
    const res = await api.get(BASE)
    expect(res.status).toBe(200)
    const machine = res.body.data.machines.find((m) => m.sn === sn)
    expect(machine).toMatchObject({
      mode: "shadow", online: true, model: "SpeedFace-V5L", firmware: "ZAM230-NF50VA-Ver1.1.9", users: 4206, faces: 4035,
      facePhotos: 3585, maxFaces: 10000, ip: "10.230.8.111", scanner: null,
    })
    expect(res.body.data.faces).toHaveProperty("stored")
  })

  it("links a machine to a scanner, refuses live without a link, and shows activity", async () => {
    const sn = machineSn()
    await request(app).get(`/iclock/ping?SN=${sn}`)
    const api = await as(await seed.admin())

    expect((await api.patch(`${BASE}/${sn}`).send({ mode: "live" })).status).toBe(400)

    const scanner = await FaceScanner.create({ name: "Mess A", username: `m-${sn.toLowerCase()}`, passwordHash: "x", type: "dining-meal", direction: "in" })
    const linked = await api.patch(`${BASE}/${sn}`).send({ faceScannerId: String(scanner._id), alias: "Mess A door", mode: "live" })
    expect(linked.status).toBe(200)
    expect(linked.body.data.machines.find((m) => m.sn === sn)).toMatchObject({ alias: "Mess A door", mode: "live", scanner: { name: "Mess A" } })
    expect((await IclockDevice.findOne({ sn }).lean()).mode).toBe("live")

    expect((await api.patch(`${BASE}/${sn}`).send({ mode: "sideways" })).status).toBe(400)
    expect((await api.patch(`${BASE}/NOPE`).send({ alias: "x" })).status).toBe(404)

    const activity = await api.get(`${BASE}/${sn}/activity`)
    expect(activity.status).toBe(200)
    expect(activity.body.data).toHaveProperty("punches")
  })

  it("is admin-only", async () => {
    const student = await as(await seed.student())
    expect((await student.get(BASE)).status).toBe(403)
  })
})
