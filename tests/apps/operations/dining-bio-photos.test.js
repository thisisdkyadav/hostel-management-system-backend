/**
 * Face-scanner bio-photo requests: student upload + request, Admin/Office
 * review, push to EasyWDMS (client stubbed), and the EasyWDMS login cipher.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createStudentProfile } from "../../helpers/seed/students.js"
import { fileAccessService } from "../../../src/services/storage/file-access.service.js"
import { storageClient } from "../../../src/services/storage/storage.client.js"
import { validateBioPhotoBuffer, readBioPhotoSize } from "../../../src/services/dining/bioPhotoImage.js"
import {
  EasyWdmsClient,
  EasyWdmsError,
  buildLoginPayload,
  extractCsrfInput,
  rc4,
  setEasyWdmsClient,
} from "../../../src/services/easywdms/easywdms.client.js"
import { bioPhotoOwner } from "../../../src/services/dining/bioPhotoOwner.service.js"

const STUDENT_BASE = "/api/v1/students/dining/bio-photo"
const BASE = "/api/v1/dining-bio-photos"
const POLICY = "dining-bio-photos"

// ---- tiny image fixtures -------------------------------------------------
const jpeg = (width, height, extra = 0) => {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, ...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0])
  const sof = Buffer.alloc(19)
  sof.writeUInt16BE(0xffc0, 0)
  sof.writeUInt16BE(17, 2)
  sof[4] = 8
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof[9] = 3
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(extra), Buffer.from([0xff, 0xd9])])
}
const png = (width, height) => {
  const buffer = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
  buffer.writeUInt32BE(13, 8)
  buffer.write("IHDR", 12, "latin1")
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}
const gif = () => Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00", "latin1")

// ---- storage stub: ref -> { policy, actorId, buffer } ----------------------
const files = new Map()
let refCounter = 0
const stubStorage = () => {
  vi.spyOn(storageClient, "upload").mockImplementation(async ({ file, policy, actorId }) => {
    const ref = `media://bio-${++refCounter}`
    files.set(ref, { policy: policy === "dining-bio-photo" ? POLICY : policy, actorId: String(actorId), buffer: file.buffer, contentType: file.mimetype })
    return { file_id: `bio-${refCounter}`, file_ref: ref, url: `/files/${refCounter}`, content_type: file.mimetype, size: file.buffer.length, original_name: file.originalname }
  })
  vi.spyOn(fileAccessService, "getMetadata").mockImplementation(async (ref) => {
    const meta = files.get(ref)
    if (!meta) throw new Error("File not found")
    return { fileRef: ref, policy: meta.policy, actorId: meta.actorId, actorRole: "Student", entityHint: meta.actorId, contentType: meta.contentType }
  })
  vi.spyOn(fileAccessService, "getBuffer").mockImplementation(async (ref) => {
    const meta = files.get(ref)
    if (!meta) throw new Error("File not found")
    return { buffer: meta.buffer, contentType: meta.contentType }
  })
}
const addFile = (actorId, buffer, policy = POLICY) => {
  const ref = `media://bio-${++refCounter}`
  files.set(ref, { policy, actorId: String(actorId), buffer, contentType: "image/jpeg" })
  return ref
}

// ---- fake EasyWDMS client ---------------------------------------------------
const fakeScanner = ({ configured = true, fail = "" } = {}) => {
  const calls = []
  const client = {
    configured,
    importBioPhoto: vi.fn(async (args) => {
      calls.push(args)
      if (fail) throw new EasyWdmsError(fail)
      return { ok: true }
    }),
  }
  setEasyWdmsClient(client)
  return { client, calls }
}

beforeAll(async () => {
  await setupTestDb()
})
afterAll(async () => {
  setEasyWdmsClient(null)
  await teardownTestDb()
})
beforeEach(() => stubStorage())
afterEach(() => {
  vi.restoreAllMocks()
})

let rollSeq = 0
const makeStudent = async (name = "Bio Student") => {
  const user = await seed.student({ name })
  const rollNumber = `BIO${String(++rollSeq).padStart(4, "0")}`
  await createStudentProfile({ userId: user._id, rollNumber })
  return { user, rollNumber, api: await as(user) }
}

const createRequest = async (student, buffer = jpeg(640, 800), note = "") => {
  const photoRef = addFile(student.user._id, buffer)
  return student.api.post(STUDENT_BASE).send({ photoRef, note })
}

// ============================================================================

describe("image rules", () => {
  it("accepts JPEG and PNG by content and reads their size", () => {
    expect(validateBioPhotoBuffer(jpeg(640, 800))).toEqual({ ok: true, contentType: "image/jpeg", width: 640, height: 800 })
    expect(validateBioPhotoBuffer(png(500, 500))).toEqual({ ok: true, contentType: "image/png", width: 500, height: 500 })
    expect(readBioPhotoSize(jpeg(1200, 1600))).toEqual({ width: 1200, height: 1600 })
  })

  it("rejects other formats, tiny or huge photos and oversized files", () => {
    expect(validateBioPhotoBuffer(gif()).message).toBe("Only JPG or PNG photos are accepted")
    expect(validateBioPhotoBuffer(Buffer.from("%PDF-1.4 hello")).ok).toBe(false)
    expect(validateBioPhotoBuffer(jpeg(200, 800)).message).toMatch(/too small/)
    expect(validateBioPhotoBuffer(png(7000, 800)).message).toMatch(/too large/)
    expect(validateBioPhotoBuffer(jpeg(640, 800, 5 * 1024 * 1024)).message).toMatch(/5 MB or smaller/)
  })
})

describe("upload endpoint", () => {
  it("stores a JPEG under the bio-photo policy and returns its size", async () => {
    const student = await makeStudent()
    const res = await student.api.post("/api/v1/upload/dining-bio-photo").attach("file", jpeg(640, 800), { filename: "me.jpeg", contentType: "image/jpeg" })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ contentType: "image/jpeg", width: 640, height: 800 })
    expect(storageClient.upload).toHaveBeenCalledWith(expect.objectContaining({ policy: "dining-bio-photo", actorRole: "Student" }))
  })

  it("rejects a GIF even when it is named .jpg", async () => {
    const student = await makeStudent()
    const res = await student.api.post("/api/v1/upload/dining-bio-photo").attach("file", gif(), { filename: "me.jpg", contentType: "image/jpeg" })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe("Only JPG or PNG photos are accepted")
    expect(storageClient.upload).not.toHaveBeenCalled()
  })

  it("is for students only", async () => {
    const admin = await as(await seed.admin())
    const res = await admin.post("/api/v1/upload/dining-bio-photo").attach("file", jpeg(640, 800), "me.jpg")
    expect(res.status).toBe(403)
  })
})

describe("student requests", () => {
  it("creates a pending request, shows it, and blocks a second one", async () => {
    const student = await makeStudent()
    const res = await createRequest(student, png(600, 600), "  New haircut  ")
    expect(res.status).toBe(201)
    expect(res.body.data.request).toMatchObject({ status: "pending", rollNumber: student.rollNumber, note: "New haircut" })
    expect(res.body.data.request.photo).toMatchObject({ contentType: "image/png", width: 600, height: 600 })

    const again = await createRequest(student)
    expect(again.status).toBe(409)

    const view = await student.api.get(STUDENT_BASE)
    expect(view.status).toBe(200)
    expect(view.body.data.current.id).toBe(res.body.data.request.id)
    expect(view.body.data.rules).toEqual({ formats: ["JPG", "PNG"], maxSizeMb: 5, minSidePx: 300 })
  })

  it("refuses refs that are not this student's bio-photo upload", async () => {
    const student = await makeStudent()
    const other = await makeStudent()
    const foreign = addFile(other.user._id, jpeg(640, 800))
    expect((await student.api.post(STUDENT_BASE).send({ photoRef: foreign })).status).toBe(400)
    const wrongPolicy = addFile(student.user._id, jpeg(640, 800), "dining-rebate-forms")
    expect((await student.api.post(STUDENT_BASE).send({ photoRef: wrongPolicy })).status).toBe(400)
    expect((await student.api.post(STUDENT_BASE).send({ photoRef: "not-a-ref" })).status).toBe(400)
    // The stored bytes are re-checked: a GIF stored under the policy is refused.
    const res = await createRequest(student, gif())
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Only JPG or PNG photos are accepted")
  })

  it("cancels only its own pending request", async () => {
    const student = await makeStudent()
    const other = await makeStudent()
    const { body } = await createRequest(student)
    const id = body.data.request.id
    expect((await other.api.delete(`${STUDENT_BASE}/${id}`)).status).toBe(404)
    const res = await student.api.delete(`${STUDENT_BASE}/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.request.status).toBe("cancelled")
    expect((await student.api.delete(`${STUDENT_BASE}/${id}`)).status).toBe(409)
    // A new request is allowed after cancelling.
    expect((await createRequest(student)).status).toBe(201)
  })
})

describe("review (Admin + Dining Office)", () => {
  let adminApi
  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("grants Admin and Dining Office, refuses caterers, students and denied office", async () => {
    fakeScanner()
    expect((await adminApi.get(BASE)).status).toBe(200)
    expect((await (await as(await seed.createUser({ role: "Dining", subRole: "Office" }))).get(BASE)).status).toBe(200)
    expect((await (await as(await seed.createUser({ role: "Dining", subRole: "Caterer" }))).get(BASE)).status).toBe(403)
    expect((await (await makeStudent()).api.get(BASE)).status).toBe(403)
    const denied = await seed.createUser({ role: "Dining", subRole: "Office", authz: { override: { denyRoutes: ["route.admin.diningBioPhotos"] } } })
    expect((await (await as(denied)).get(BASE)).status).toBe(403)
  })

  it("lists pending oldest first with student details, counts and search", async () => {
    fakeScanner()
    const first = await makeStudent("Zara Pending")
    const second = await makeStudent("Yusuf Pending")
    await createRequest(first)
    await createRequest(second)
    const res = await adminApi.get(BASE).query({ status: "pending", search: "pending" })
    expect(res.status).toBe(200)
    const names = res.body.data.items.map((item) => item.student.name)
    expect(names).toEqual(["Zara Pending", "Yusuf Pending"])
    expect(res.body.data.counts.pending).toBeGreaterThanOrEqual(2)
    expect(res.body.data.scanner).toEqual({ configured: true })
    const byRoll = await adminApi.get(BASE).query({ search: second.rollNumber })
    expect(byRoll.body.data.items.map((item) => item.rollNumber)).toEqual([second.rollNumber])
    expect((await adminApi.get(BASE).query({ status: "nope" })).status).toBe(400)
  })

  it("approve uploads to the scanner software and marks it approved", async () => {
    const { calls } = fakeScanner()
    const student = await makeStudent()
    const photo = jpeg(700, 900)
    const { body } = await createRequest(student, photo)
    const res = await adminApi.post(`${BASE}/${body.data.request.id}/approve`)
    expect(res.status).toBe(200)
    expect(res.body.data.request).toMatchObject({ status: "approved", lastError: "", attempts: 1 })
    expect(res.body.data.request.pushedAt).toBeTruthy()
    expect(res.body.data.request.reviewedBy).toBeTruthy()
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ rollNumber: student.rollNumber, contentType: "image/jpeg", overwrite: true })
    expect(Buffer.compare(calls[0].buffer, photo)).toBe(0)

    expect((await adminApi.post(`${BASE}/${body.data.request.id}/approve`)).status).toBe(409)
    const view = await student.api.get(STUDENT_BASE)
    expect(view.body.data.current.status).toBe("approved")
  })

  it("a failed upload keeps the request pending with the error; retry then succeeds", async () => {
    fakeScanner({ fail: "Face scanner software: Face not detected" })
    const student = await makeStudent()
    const { body } = await createRequest(student)
    const id = body.data.request.id
    const res = await adminApi.post(`${BASE}/${id}/approve`)
    expect(res.status).toBe(502)
    expect(res.body.message).toBe("Face scanner software: Face not detected")
    const pending = await adminApi.get(BASE).query({ search: student.rollNumber })
    expect(pending.body.data.items[0]).toMatchObject({ status: "pending", lastError: "Face scanner software: Face not detected", attempts: 1 })

    fakeScanner()
    const retry = await adminApi.post(`${BASE}/${id}/approve`)
    expect(retry.status).toBe(200)
    expect(retry.body.data.request).toMatchObject({ status: "approved", lastError: "", attempts: 2 })
  })

  it("approve needs the scanner software to be configured", async () => {
    fakeScanner({ configured: false })
    const student = await makeStudent()
    const { body } = await createRequest(student)
    const res = await adminApi.post(`${BASE}/${body.data.request.id}/approve`)
    expect(res.status).toBe(503)
    const list = await adminApi.get(BASE)
    expect(list.body.data.scanner).toEqual({ configured: false })
  })

  it("only one push at a time: a claimed request can't be approved or rejected again", async () => {
    fakeScanner()
    const student = await makeStudent()
    const { body } = await createRequest(student)
    const id = body.data.request.id
    const claimed = await bioPhotoOwner.claimForPush(id)
    expect(claimed).toBeTruthy()
    expect((await adminApi.post(`${BASE}/${id}/approve`)).status).toBe(409)
    expect((await adminApi.post(`${BASE}/${id}/reject`).send({ comment: "Blurry" })).status).toBe(409)
    // A stale claim (older than the lock window) frees itself.
    expect(await bioPhotoOwner.claimForPush(id, new Date(Date.now() + 3 * 60 * 1000))).toBeTruthy()
  })

  it("reject needs a reason and closes the request", async () => {
    const student = await makeStudent()
    const { body } = await createRequest(student)
    const id = body.data.request.id
    expect((await adminApi.post(`${BASE}/${id}/reject`).send({ comment: "  " })).status).toBe(400)
    expect((await adminApi.post(`${BASE}/${id}/reject`).send({ comment: "x".repeat(301) })).status).toBe(400)
    const res = await adminApi.post(`${BASE}/${id}/reject`).send({ comment: "Face is covered" })
    expect(res.status).toBe(200)
    expect(res.body.data.request).toMatchObject({ status: "rejected", reviewComment: "Face is covered" })
    const view = await student.api.get(STUDENT_BASE)
    expect(view.body.data.current).toMatchObject({ status: "rejected", reviewComment: "Face is covered" })
    expect((await createRequest(student)).status).toBe(201)
  })
})

describe("EasyWDMS client", () => {
  it("rc4 round-trips and the login payload is base64 of the cipher text", () => {
    const text = "csrfmiddlewaretoken=abc&username=a&password=b&template10=&login_type="
    expect(rc4("key123", rc4("key123", text))).toBe(text)
    const payload = buildLoginPayload({ csrfToken: "abc", username: "a", password: "b" })
    expect(Buffer.from(payload, "base64").toString("latin1")).toBe(rc4("abc", text))
  })

  it("matches a vector produced by the portal's own zkEncrypt()", () => {
    // Generated with the portal's easy-login.js (zkEncrypt) on 2026-11-02.
    const csrf = "gBOLlojMW8XLhxi3I1uOZRBp5dh5CN2ZrqDnag8LbtgkuCBpDBKJIrq8n4QL92aA"
    expect(buildLoginPayload({ csrfToken: csrf, username: "hms bot@x", password: "p@ss wörd&=" }).slice(0, 40)).toBe(
      "nHArl1zmP2/SO86ASzlfr09HNoZKqQs9bM2qiCaT"
    )
  })

  it("reads the csrf input from the login page", () => {
    expect(extractCsrfInput('<input type="hidden" name="csrfmiddlewaretoken" value="tok123">')).toBe("tok123")
  })

  const response = (status, { json, html, cookies = [], location } = {}) => {
    const headers = new Headers()
    if (location) headers.set("location", location)
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: Object.assign(headers, { getSetCookie: () => cookies }),
      json: async () => {
        if (json === undefined) throw new Error("not json")
        return json
      },
      text: async () => html || "",
    }
  }

  const loginResponses = () => [
    response(200, { html: '<input type="hidden" name="csrfmiddlewaretoken" value="formtok">', cookies: ["csrftoken=c1; Path=/"] }),
    response(200, { json: { ret: 0 }, cookies: ["sessionid=s1; Path=/; HttpOnly", "csrftoken=c2; Path=/"] }),
  ]

  it("logs in, posts the import with the roll-number file name, and reports success", async () => {
    const requests = []
    const queue = [...loginResponses(), response(200, { json: { code: 0, msg: "" } })]
    const fetchImpl = async (url, init) => {
      requests.push({ url, init })
      return queue.shift()
    }
    const client = new EasyWdmsClient({ baseUrl: "http://wdms", username: "bot", password: "pw", fetchImpl })
    await expect(client.importBioPhoto({ rollNumber: "230008001", buffer: jpeg(640, 800), contentType: "image/jpeg" })).resolves.toEqual({ ok: true })

    expect(requests.map((r) => `${r.init.method} ${r.url}`)).toEqual([
      "GET http://wdms/login/",
      "POST http://wdms/login/",
      "POST http://wdms/iclock/biophoto/action/",
    ])
    const login = new URLSearchParams(requests[1].init.body)
    expect(login.get("csrfmiddlewaretoken")).toBe("formtok")
    expect(login.get("encrypt_data")).toBe(buildLoginPayload({ csrfToken: "formtok", username: "bot", password: "pw" }))

    const upload = requests[2].init
    expect(upload.headers.Cookie).toContain("sessionid=s1")
    expect(upload.headers["X-CSRFToken"]).toBe("c2")
    expect(upload.body.get("action_name")).toBe("importbiophoto")
    expect(upload.body.get("overwrite")).toBe("1")
    expect(upload.body.get("ignore_error")).toBe("0")
    expect(upload.body.get("bio_photo").name).toBe("230008001.jpg")
  })

  it("re-logs in once when the session expired, and surfaces EasyWDMS errors", async () => {
    const queue = [
      ...loginResponses(),
      response(302, { location: "/login/?next=/iclock/biophoto/action/" }),
      ...loginResponses(),
      response(200, { json: { code: -1, msg: "bioPhotoImport_error_userNoFound_X1" } }),
    ]
    const client = new EasyWdmsClient({ baseUrl: "http://wdms", username: "bot", password: "pw", fetchImpl: async () => queue.shift() })
    await expect(client.importBioPhoto({ rollNumber: "X1", buffer: png(400, 400), contentType: "image/png" })).rejects.toThrow(
      "Face scanner software: bioPhotoImport_error_userNoFound_X1"
    )
    expect(queue).toHaveLength(0)
  })

  it("reports bad credentials and refuses odd roll numbers", async () => {
    const queue = [loginResponses()[0], response(200, { json: { ret: -1, message: "bad" } })]
    const client = new EasyWdmsClient({ baseUrl: "http://wdms", username: "bot", password: "pw", fetchImpl: async () => queue.shift() })
    await expect(client.importBioPhoto({ rollNumber: "R1", buffer: png(400, 400), contentType: "image/png" })).rejects.toThrow(/Couldn't log in/)
    await expect(client.importBioPhoto({ rollNumber: "../x", buffer: png(400, 400), contentType: "image/png" })).rejects.toThrow(/roll number/)
    expect(new EasyWdmsClient({ baseUrl: "", username: "", password: "" }).configured).toBe(false)
  })
})
