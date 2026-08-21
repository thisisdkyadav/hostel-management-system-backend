import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// This module uses sendStandardResponse, so every *successful* middleware pass
// emits the strict envelope { success, message, data, errors }.
//
// TWO SUSPECTED BACKEND BUGS shape the expectations below (documented, not fixed):
//  1. signature.service passes its message as success()'s SECOND argument, which
//     is the statusCode slot (`success(data, statusCode, message)`), so every
//     successful save/delete tries `res.status("Signature saved")` -> 500.
//     The DB write itself DOES happen before the response crashes.
//  2. The service falls back to `user.name` when the payload omits the name,
//     but authenticate()'s session userData never includes `name`, so the
//     fallback can never fire -> omitting `name` is always a 400.
const BASE = "/api/v1/signature"

describe("GET /signature (my signature)", () => {
  let student

  beforeAll(async () => {
    student = await seed.student()
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(BASE)
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("returns a null signature for a user who never saved one", async () => {
    const api = await as(student)
    const res = await api.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toEqual({ signature: null })
  })
})

describe("PUT /signature (save my signature)", () => {
  let student
  let warden

  beforeAll(async () => {
    student = await seed.student({ name: "Sig Student" })
    warden = await seed.warden({ name: "Sig Warden" })
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.put(BASE).send({ type: "text", text: "x" })
    expect(res.status).toBe(401)
  })

  it("400 when the payload omits name — the user.name fallback never fires", async () => {
    // SUSPECTED BUG: the service intends to fall back to `user.name`
    // (`text(data.name) || text(user.name)`), but authenticate() stores no
    // `name` in session userData, so req.user.name is always undefined and
    // every name-less save is rejected — even though the UI flow assumes it works.
    const api = await as(student)
    const res = await api.put(BASE).send({ type: "text", text: "scrawl" })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("A name is required for the signature")
  })

  it("400 for an image signature without an imageRef", async () => {
    const api = await as(student)
    const res = await api.put(BASE).send({ type: "image", name: "Sig Student", imageRef: "" })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Upload a signature image before saving")
  })

  it("400 for a text signature without text", async () => {
    const api = await as(student)
    const res = await api.put(BASE).send({ type: "text", name: "Sig Student", text: "   " })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Enter your signature text before saving")
  })

  it("persists a text signature but responds 500 (statusCode/message mixup)", async () => {
    // SUSPECTED BUG: `success({ signature }, "Signature saved")` feeds the
    // message into the statusCode parameter, so the controller calls
    // res.status("Signature saved") and the request dies with a 500 AFTER the
    // write has already been committed.
    const api = await as(student)
    const res = await api.put(BASE).send({
      type: "text",
      name: "Custom Name",
      position: "President of Everything",
      text: "A. Student",
    })
    expect(res.status).toBe(500)

    // ...but the write persisted, and students are forced to position "Student"
    const fetched = await api.get(BASE)
    expect(fetched.status).toBe(200)
    expect(fetched.body.data.signature).toMatchObject({
      type: "text",
      name: "Custom Name",
      position: "Student", // forced for students regardless of the payload
      text: "A. Student",
      imageRef: null,
    })
    expect(fetched.body.data.signature.updatedAt).toBeTruthy()
  })

  it("defaults type to 'image' when omitted; requires an imageRef", async () => {
    const api = await as(warden)
    const missing = await api.put(BASE).send({ name: "Sig Warden" })
    expect(missing.status).toBe(400)

    await api
      .put(BASE)
      .send({ name: "Sig Warden", position: "Hostel Warden", imageRef: "media://sig/warden.png" })
    const fetched = await api.get(BASE)
    expect(fetched.status).toBe(200)
    expect(fetched.body.data.signature).toMatchObject({
      type: "image", // defaulted from the omitted type
      name: "Sig Warden",
      position: "Hostel Warden",
      imageRef: "media://sig/warden.png",
      text: "",
    })
  })

  it("falls back to subRole then role for staff position when not provided", async () => {
    const aw = await seed.associateWarden({ name: "Fallback AW" })
    const awApi = await as(aw)
    await awApi.put(BASE).send({ type: "text", name: "Fallback AW", text: "scrawl" })
    const fetched = await awApi.get(BASE)
    expect(fetched.body.data.signature.position).toBe("Associate Warden") // role fallback

    const dining = await seed.createUser({ role: "Dining", subRole: "Office" })
    const diningApi = await as(dining)
    await diningApi.put(BASE).send({ type: "text", name: "Dining Office", text: "scrawl" })
    const fetched2 = await diningApi.get(BASE)
    expect(fetched2.body.data.signature.position).toBe("Office") // subRole wins over role
  })

  it("replaces an existing signature on re-save (image -> text)", async () => {
    const api = await as(warden)
    await api.put(BASE).send({ name: "Sig Warden", imageRef: "media://sig/old.png" })
    await api.put(BASE).send({ type: "text", name: "Sig Warden", text: "new scrawl" })
    const fetched = await api.get(BASE)
    expect(fetched.body.data.signature.type).toBe("text")
    expect(fetched.body.data.signature.imageRef).toBeNull()
    expect(fetched.body.data.signature.text).toBe("new scrawl")
  })
})

describe("DELETE /signature (remove my signature)", () => {
  let student

  beforeAll(async () => {
    student = await seed.student()
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.delete(BASE)
    expect(res.status).toBe(401)
  })

  it("removes the signature but responds 500 (same statusCode/message mixup)", async () => {
    // SUSPECTED BUG: same root cause as PUT — `success({ signature: null },
    // "Signature removed")` passes the message as statusCode -> 500. The $unset
    // write commits before the response crashes.
    const api = await as(student)
    await api.put(BASE).send({ type: "text", name: "Erased Person", text: "to be erased" })

    const del = await api.delete(BASE)
    expect(del.status).toBe(500)

    const fetched = await api.get(BASE)
    expect(fetched.status).toBe(200)
    expect(fetched.body.data).toEqual({ signature: null })
  })

  it("is idempotent at the data level — deleting again still unsets nothing", async () => {
    const api = await as(student)
    const res = await api.delete(BASE)
    expect(res.status).toBe(500) // same suspected bug
    const fetched = await api.get(BASE)
    expect(fetched.body.data).toEqual({ signature: null })
  })
})

describe("GET /signature/directory (admin signatory picker)", () => {
  let admin
  let plainUser
  let signerText
  let signerImage

  beforeAll(async () => {
    admin = await seed.admin()
    plainUser = await seed.student({ name: "No Signature Nancy" })

    // Signatures are saved through the public API. Saves respond 500 (suspected
    // bug above) but persist, so these users become usable signatories.
    signerText = await seed.warden({ name: "Dir Bella Textsign" })
    await (await as(signerText)).put(BASE).send({ type: "text", name: "Bella", text: "Bella" })

    signerImage = await seed.admin({ name: "Dir Andy Imagesign" })
    await (await as(signerImage))
      .put(BASE)
      .send({ name: "Andy", imageRef: "media://sig/andy.png" })

    // One user who saved then deleted — must NOT appear.
    const ghost = await seed.hostelSupervisor({ name: "Dir Ghost Signer" })
    const ghostApi = await as(ghost)
    await ghostApi.put(BASE).send({ type: "text", name: "Ghost", text: "boo" })
    await ghostApi.delete(BASE)
  })

  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/directory`)
    expect(res.status).toBe(401)
  })

  it("403 for non-admin roles (Student)", async () => {
    const api = await as(plainUser)
    const res = await api.get(`${BASE}/directory`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("403 even for privileged non-admin roles (Warden)", async () => {
    const api = await as(signerText) // warden with a usable signature
    const res = await api.get(`${BASE}/directory`)
    expect(res.status).toBe(403)
  })

  it("lists only users with usable signatures, sorted by name", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/directory`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const signatories = res.body.data.signatories
    const names = signatories.map((s) => s.name)
    expect(names).toEqual([
      ...names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    ])
    expect(names).toContain("Dir Andy Imagesign")
    expect(names).toContain("Dir Bella Textsign")
    expect(names).not.toContain("No Signature Nancy")
    expect(names).not.toContain("Dir Ghost Signer")

    const andy = signatories.find((s) => s.name === "Dir Andy Imagesign")
    expect(andy).toMatchObject({
      userId: String(signerImage._id),
      role: "Admin",
      type: "image",
      hasImage: true,
    })
    const bella = signatories.find((s) => s.name === "Dir Bella Textsign")
    expect(bella).toMatchObject({
      userId: String(signerText._id),
      role: "Warden",
      type: "text",
      hasImage: false,
      position: "Warden",
    })
  })

  it("filters by search term on name", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/directory`).query({ search: "dir bella" })
    expect(res.status).toBe(200)
    expect(res.body.data.signatories.map((s) => s.name)).toEqual(["Dir Bella Textsign"])
  })

  it("returns an empty list when nobody matches the search", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/directory`).query({ search: "zzz-nobody-zzz" })
    expect(res.status).toBe(200)
    expect(res.body.data.signatories).toEqual([])
  })
})

describe("ordered workflow: save -> directory -> delete -> directory", () => {
  it("reflects the full lifecycle in the admin directory", async () => {
    const admin = await seed.admin()
    const signer = await seed.student({ name: "WF Lifecycle Larry" })
    const signerApi = await as(signer)
    const adminApi = await as(admin)

    // starts absent
    const before = await adminApi.get(`${BASE}/directory`).query({ search: "wf lifecycle larry" })
    expect(before.body.data.signatories).toEqual([])

    // save text signature (responds 500 — suspected bug — but persists) -> appears
    const saved = await signerApi.put(BASE).send({ type: "text", name: "Larry", text: "Larry L." })
    expect(saved.status).toBe(500)
    const during = await adminApi.get(`${BASE}/directory`).query({ search: "wf lifecycle larry" })
    expect(during.body.data.signatories).toHaveLength(1)
    expect(during.body.data.signatories[0]).toMatchObject({
      userId: String(signer._id),
      type: "text",
      hasImage: false,
      position: "Student",
    })

    // delete (also 500 — same bug) -> disappears again
    const del = await signerApi.delete(BASE)
    expect(del.status).toBe(500)
    const after = await adminApi.get(`${BASE}/directory`).query({ search: "wf lifecycle larry" })
    expect(after.body.data.signatories).toEqual([])
  })
})
