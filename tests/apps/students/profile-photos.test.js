import { beforeAll, afterAll, describe, expect, it } from "vitest"
import http from "node:http"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { createStudentProfile } from "../../helpers/seed/students.js"

const BASE = "/api/v1/students/profiles-admin"
const URL = `${BASE}/profiles/profile-picture`
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 2, 0xff, 0xd9])
let adminApi, studentApi, supervisorApi, deniedApi, stubServer, env, originalStorage
let uploaded = 0
let heldResponses = null

const upload = (api, name, override, bytes = JPEG) => {
  const request = api.post(URL)
  if (override !== undefined) request.field("override", override)
  return request.attach("image", bytes, { filename: name, contentType: "image/jpeg" })
}

const createStudent = async (rollNumber, profileImage) => {
  const user = await seed.student({ profileImage })
  await createStudentProfile({ userId: user._id, rollNumber })
  return user
}

const storedPhoto = async (user) => {
  const response = await adminApi.get(`${BASE}/profile/details/${user._id}`)
  expect(response.status).toBe(200)
  return response.body.data.student.profileImage
}

beforeAll(async () => {
  await setupTestDb()
  adminApi = await as(await seed.admin())
  studentApi = await as(await seed.student())
  supervisorApi = await as(await seed.hostelSupervisor())
  deniedApi = await as(await seed.admin({ authz: { override: { denyCapabilities: ["cap.students.edit.personal"] } } }))

  // Stub only the external storage HTTP service; auth, sessions and DB are real.
  stubServer = http.createServer((req, res) => {
    req.resume()
    req.on("end", () => {
      const fileRef = `media://photo-test-${++uploaded}`
      const respond = () => {
        res.setHeader("content-type", "application/json")
        res.end(JSON.stringify({ file_ref: fileRef }))
      }
      if (!heldResponses) return respond()
      heldResponses.push(respond)
      if (heldResponses.length === 2) {
        const pair = heldResponses
        heldResponses = null
        pair.forEach((release) => release())
      }
    })
  })
  await new Promise((resolve) => stubServer.listen(0, "127.0.0.1", resolve))
  env = (await import("../../../src/config/env.config.js")).env
  originalStorage = { ...env.storage }
  env.storage.serviceUrl = `http://127.0.0.1:${stubServer.address().port}`
  env.storage.internalApiKey = "profile-photo-test-key"
})

afterAll(async () => {
  if (originalStorage) Object.assign(env.storage, originalStorage)
  if (stubServer) await new Promise((resolve) => stubServer.close(resolve))
  await teardownTestDb()
})

describe("bulk profile pictures", () => {
  it("requires authentication and student edit access", async () => {
    expect((await upload(await anon(), "230001024.jpg")).status).toBe(401)
    expect((await upload(studentApi, "230001024.jpg")).status).toBe(403)
    expect((await upload(deniedApi, "230001024.jpg")).status).toBe(403)
  })

  it("validates missing files, roll filenames, JPEG bytes, override and size", async () => {
    expect((await adminApi.post(URL).send({})).status).toBe(400)
    expect((await upload(adminApi, "not a roll.jpg")).status).toBe(400)
    expect((await upload(adminApi, "230001024.png")).status).toBe(400)
    expect((await upload(adminApi, "230001024.jpg", undefined, Buffer.from("not JPEG"))).status).toBe(400)
    expect((await upload(adminApi, "230001024.jpg", "yes")).status).toBe(400)
    const oversized = await upload(adminApi, "230001024.jpg", undefined, Buffer.alloc(500 * 1024 + 1))
    expect(oversized.status).toBe(400)
    expect(oversized.body.message).toMatch(/500KB/)
  })

  it("reports unknown students", async () => {
    expect((await upload(adminApi, "UNKNOWN.jpg")).status).toBe(404)
  })

  it("matches roll numbers case-insensitively and saves a missing picture", async () => {
    const user = await createStudent("PHOTO001")
    const result = await upload(adminApi, "photo001.JPG")
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({ success: true, data: { status: "updated", rollNumber: "PHOTO001" } })
    expect(await storedPhoto(user)).toMatch(/^media:\/\/photo-test-/)
  })

  it("fills both null and empty profile pictures", async () => {
    for (const [index, existing] of [null, ""].entries()) {
      const user = await createStudent(`EMPTY${index}`, existing)
      expect((await upload(adminApi, `EMPTY${index}.jpeg`)).body.data.status).toBe("updated")
      expect(await storedPhoto(user)).toMatch(/^media:\/\/photo-test-/)
    }
  })

  it("preserves existing pictures by default without uploading to storage", async () => {
    const user = await createStudent("EXISTING", "https://example.test/original.jpg")
    const before = uploaded
    for (const override of [undefined, "false"]) {
      const result = await upload(adminApi, "EXISTING.jpg", override)
      expect(result.body.data.status).toBe("skipped")
    }
    expect(uploaded).toBe(before)
    expect(await storedPhoto(user)).toBe("https://example.test/original.jpg")
  })

  it("replaces an existing picture only with explicit override", async () => {
    const user = await createStudent("OVERRIDE", "https://example.test/original.jpg")
    const result = await upload(adminApi, "OVERRIDE.jpeg", "true")
    expect(result.body.data.status).toBe("updated")
    expect(await storedPhoto(user)).toMatch(/^media:\/\/photo-test-/)
  })

  it("fails closed for a hostel supervisor without an active hostel", async () => {
    await createStudent("SCOPED")
    expect((await upload(supervisorApi, "SCOPED.jpg")).status).toBe(403)
  })

  it("concurrent default uploads cannot overwrite each other", async () => {
    const user = await createStudent("RACE")
    heldResponses = []
    const results = await Promise.all([upload(adminApi, "RACE.jpg"), upload(adminApi, "RACE.jpeg")])
    expect(results.map((result) => result.status)).toEqual([200, 200])
    expect(results.map((result) => result.body.data.status).sort()).toEqual(["skipped", "updated"])
    expect(await storedPhoto(user)).toMatch(/^media:\/\/photo-test-/)
  })
})
