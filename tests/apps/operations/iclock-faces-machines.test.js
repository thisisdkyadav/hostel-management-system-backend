/**
 * HMS-held scanner faces (import from EasyWDMS, token-guarded download by the
 * machines) and the Face Scanners → Machines API.
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
import { setEasyWdmsClient } from "../../../src/services/easywdms/easywdms.client.js"
import { faceToken, faceUrlFor, importFacesFromEasyWdms } from "../../../src/services/dining/scanner-faces.service.js"
import { DiningScannerUser, FaceScanner, IclockDevice } from "../../../src/models/index.js"

const jpeg = (width, height, salt = 0) => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, salt])
  const sof = Buffer.alloc(19)
  sof.writeUInt16BE(0xffc0, 0)
  sof.writeUInt16BE(17, 2)
  sof[4] = 8
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof[9] = 3
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])])
}

let app
let seq = 0
const roll = () => `FC${Date.now().toString(36)}${++seq}`.toUpperCase()
const files = new Map() // storage ref -> buffer

beforeAll(async () => {
  await setupTestDb()
  await iclockOwner.ensureIndexes()
  app = createIclockApp()
})
afterAll(async () => {
  setEasyWdmsClient(null)
  await teardownTestDb()
})
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

const easyWdms = (photosByPath) => {
  const client = {
    configured: true,
    fetchBioPhotoFile: vi.fn(async (path) => (photosByPath[path] ? { buffer: photosByPath[path], contentType: "image/jpeg" } : null)),
  }
  setEasyWdmsClient(client)
  return client
}

const scannerRow = (rollNumber, path, registeredAt = "2026-11-01 10:00:00") =>
  DiningScannerUser.create({ rollNumber, name: "Face Test", onScanner: true, bioPhoto: { present: true, approval: "approved", path, registeredAt } })

describe("scanner faces", () => {
  it("imports EasyWDMS photos once, re-imports only changed ones, marks unusable ones", async () => {
    fakeStorage()
    const [a, b, c] = [roll(), roll(), roll()]
    await scannerRow(a, `biophoto/x/${a}.jpg`)
    await scannerRow(b, `biophoto/x/${b}.jpg`)
    await scannerRow(c, `biophoto/x/${c}.jpg`)
    const client = easyWdms({
      [`biophoto/x/${a}.jpg`]: jpeg(480, 640),
      [`biophoto/x/${b}.jpg`]: jpeg(480, 640),
      [`biophoto/x/${c}.jpg`]: Buffer.from("not an image"),
    })

    const first = await importFacesFromEasyWdms({ trigger: "test" })
    expect(first).toMatchObject({ stored: 2, unusable: 1, failed: 0 })
    const rowA = await DiningScannerUser.findOne({ rollNumber: a }).lean()
    expect(rowA.face).toMatchObject({ source: "easywdms", contentType: "image/jpeg", width: 480, height: 640 })
    expect(rowA.face.sha256).toHaveLength(64)
    expect((await DiningScannerUser.findOne({ rollNumber: c }).lean()).face.problem).toBeTruthy()

    // Nothing changed → nothing downloaded again.
    client.fetchBioPhotoFile.mockClear()
    expect(await importFacesFromEasyWdms({ trigger: "test" })).toMatchObject({ stored: 0, unusable: 0, processed: 0 })
    expect(client.fetchBioPhotoFile).not.toHaveBeenCalled()

    // b re-registered in EasyWDMS → only b is fetched again.
    await DiningScannerUser.updateOne({ rollNumber: b }, { $set: { "bioPhoto.registeredAt": "2026-11-03 12:00:00" } })
    client.fetchBioPhotoFile.mockImplementation(async () => ({ buffer: jpeg(480, 640, 1), contentType: "image/jpeg" }))
    expect(await importFacesFromEasyWdms({ trigger: "test" })).toMatchObject({ stored: 1, processed: 1 })
  })

  it("keeps an EasyWDMS photo smaller than the upload rules (the machines already accept it)", async () => {
    fakeStorage()
    const r = roll()
    await scannerRow(r, `biophoto/x/${r}.jpg`)
    easyWdms({ [`biophoto/x/${r}.jpg`]: jpeg(240, 320) })
    await importFacesFromEasyWdms({ trigger: "test" })
    expect((await DiningScannerUser.findOne({ rollNumber: r }).lean()).face).toMatchObject({ width: 240, height: 320, problem: "" })
  })

  it("never replaces a face that came from a student request", async () => {
    fakeStorage()
    const r = roll()
    await scannerRow(r, `biophoto/x/${r}.jpg`)
    await DiningScannerUser.updateOne({ rollNumber: r }, { $set: { face: { ref: "media://from-request", source: "request", contentType: "image/jpeg" } } })
    easyWdms({ [`biophoto/x/${r}.jpg`]: jpeg(480, 640) })
    await importFacesFromEasyWdms({ trigger: "test" })
    expect((await DiningScannerUser.findOne({ rollNumber: r }).lean()).face.ref).toBe("media://from-request")
  })

  it("machines download a face only with the right token, and the old url dies when the photo changes", async () => {
    fakeStorage()
    const r = roll()
    await scannerRow(r, `biophoto/x/${r}.jpg`)
    easyWdms({ [`biophoto/x/${r}.jpg`]: jpeg(480, 640) })
    await importFacesFromEasyWdms({ trigger: "test" })
    const row = await DiningScannerUser.findOne({ rollNumber: r }).lean()
    const url = faceUrlFor(row)
    expect(url).toBe(`iclock/file/biophoto/${faceToken(r, row.face.ref)}/${r}.jpg`)

    const ok = await request(app).get(`/${url}`)
    expect(ok.status).toBe(200)
    expect(ok.headers["content-type"]).toContain("image/jpeg")
    expect(Buffer.compare(ok.body, files.get(row.face.ref))).toBe(0)

    expect((await request(app).get(`/iclock/file/biophoto/${"0".repeat(32)}/${r}.jpg`)).status).toBe(404)
    expect((await request(app).get(`/iclock/file/biophoto/${faceToken(r, row.face.ref)}/SOMEONEELSE.jpg`)).status).toBe(404)

    await DiningScannerUser.updateOne({ rollNumber: r }, { $set: { "face.ref": "media://newer" } })
    files.set("media://newer", jpeg(480, 640, 2))
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
