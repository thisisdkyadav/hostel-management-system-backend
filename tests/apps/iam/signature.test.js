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

// This module uses sendStandardResponse, so every successful request emits the
// strict envelope { success, message, data, errors }.
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

  it("falls back to the stored user's name when the payload omits it", async () => {
    const api = await as(student)
    const res = await api.put(BASE).send({ type: "text", text: "scrawl" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Signature saved")
    const fetched = await api.get(BASE)
    expect(fetched.body.data.signature.name).toBe("Sig Student")
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

  it("persists a text signature and answers with the standard envelope", async () => {
    const api = await as(student)
    const res = await api.put(BASE).send({
      type: "text",
      name: "Custom Name",
      position: "President of Everything",
      text: "A. Student",
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Signature saved")

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

  it("removes the signature and answers with the standard envelope", async () => {
    const api = await as(student)
    await api.put(BASE).send({ type: "text", name: "Erased Person", text: "to be erased" })

    const del = await api.delete(BASE)
    expect(del.status).toBe(200)
    expect(del.body.success).toBe(true)
    expect(del.body.message).toBe("Signature removed")

    const fetched = await api.get(BASE)
    expect(fetched.status).toBe(200)
    expect(fetched.body.data).toEqual({ signature: null })
  })

  it("is idempotent at the data level — deleting again still unsets nothing", async () => {
    const api = await as(student)
    const res = await api.delete(BASE)
    expect(res.status).toBe(200)
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

    // Signatures are saved through the public API.
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

    // save text signature -> appears
    const saved = await signerApi.put(BASE).send({ type: "text", name: "Larry", text: "Larry L." })
    expect(saved.status).toBe(200)
    const during = await adminApi.get(`${BASE}/directory`).query({ search: "wf lifecycle larry" })
    expect(during.body.data.signatories).toHaveLength(1)
    expect(during.body.data.signatories[0]).toMatchObject({
      userId: String(signer._id),
      type: "text",
      hasImage: false,
      position: "Student",
    })

    // delete -> disappears again
    const del = await signerApi.delete(BASE)
    expect(del.status).toBe(200)
    const after = await adminApi.get(`${BASE}/directory`).query({ search: "wf lifecycle larry" })
    expect(after.body.data.signatories).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Hardened edges
// ---------------------------------------------------------------------------

describe("GET /signature (my signature) — hardened edges", () => {
  it("signatures are owner-scoped: one user's save is invisible to another", async () => {
    const a = await seed.student({ name: "Scope Owner A" })
    const b = await seed.student({ name: "Scope Bystander B" })

    await (await as(a)).put(BASE).send({ type: "text", text: "only mine" })

    const other = await (await as(b)).get(BASE)
    expect(other.status).toBe(200)
    expect(other.body.data).toEqual({ signature: null })

    const own = await (await as(a)).get(BASE)
    expect(own.body.data.signature.text).toBe("only mine")
  })

  it("GET after DELETE returns the null shape with the standard envelope keys", async () => {
    const u = await seed.student({ name: "Envelope Probe" })
    const api = await as(u)
    await api.put(BASE).send({ type: "text", text: "temp" })
    await api.delete(BASE)
    const res = await api.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ success: true, data: { signature: null } })
    expect("message" in res.body).toBe(true)
    expect("errors" in res.body).toBe(true)
  })
})

describe("PUT /signature — hardened validation edges", () => {
  let student

  beforeAll(async () => {
    student = await seed.student({ name: "Hard Sig Student" })
  })

  it("empty object body defaults to type image and demands an imageRef", async () => {
    const api = await as(student)
    const res = await api.put(BASE).send({})
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Upload a signature image before saving")
    expect(res.body.data).toBeNull()
    expect(res.body.errors).toBeNull()
  })

  it("an unrecognized type value coerces to image (and then requires an imageRef)", async () => {
    const api = await as(student)
    const res = await api.put(BASE).send({ type: "scrawl", name: "Hard Sig Student", text: "real text" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Upload a signature image before saving")
  })

  it("a non-string type value (number) also coerces to image", async () => {
    const api = await as(student)
    const res = await api.put(BASE).send({ type: 123, name: "Hard Sig Student" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Upload a signature image before saving")
  })

  it("non-string imageRef values are stringified and accepted (lenient coercion, current behavior)", async () => {
    const u = await seed.warden({ name: "Coercion Warden" })
    const api = await as(u)
    const res = await api.put(BASE).send({ name: "Coercion Warden", imageRef: 12345 })
    expect(res.status).toBe(200)
    const fetched = await api.get(BASE)
    expect(fetched.body.data.signature.imageRef).toBe("12345")
  })

  it("a whitespace-only name falls back to the stored user's name", async () => {
    const api = await as(student)
    const res = await api.put(BASE).send({ type: "text", name: "   ", text: "sig" })
    expect(res.status).toBe(200)
    const fetched = await api.get(BASE)
    expect(fetched.body.data.signature.name).toBe("Hard Sig Student")
  })

  it("accepts a very long signature text (no max length enforced)", async () => {
    const u = await seed.warden({ name: "Long Text Warden" })
    const api = await as(u)
    const huge = "x".repeat(10000)
    const res = await api.put(BASE).send({ type: "text", name: "Long Text Warden", text: huge })
    expect(res.status).toBe(200)
    const fetched = await api.get(BASE)
    expect(fetched.body.data.signature.text).toHaveLength(10000)
  })

  it("double submit of the same payload succeeds twice and keeps one signature", async () => {
    const u = await seed.associateWarden({ name: "Double Submit AW" })
    const api = await as(u)
    const payload = { type: "text", name: "Double Submit AW", text: "same scrawl" }
    const first = await api.put(BASE).send(payload)
    const second = await api.put(BASE).send(payload)
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const fetched = await api.get(BASE)
    expect(fetched.body.data.signature.text).toBe("same scrawl")
  })
})

describe("DELETE /signature — hardened edges", () => {
  it("delete does not disturb another user's signature", async () => {
    const a = await seed.student({ name: "Del Iso A" })
    const b = await seed.student({ name: "Del Iso B" })
    await (await as(b)).put(BASE).send({ type: "text", text: "keep me" })
    await (await as(a)).put(BASE).send({ type: "text", text: "erase me" })
    await (await as(a)).delete(BASE)

    const survivor = await (await as(b)).get(BASE)
    expect(survivor.body.data.signature.text).toBe("keep me")
  })
})

describe("GET /signature/directory — hardened edges", () => {
  let admin
  let subRoleSigner

  beforeAll(async () => {
    admin = await seed.admin({ name: "Dir Hard Admin" })
    subRoleSigner = await seed.createUser({
      role: "Gymkhana",
      subRole: "President Gymkhana",
      name: "Dir Hard Subrole Signer",
    })
    await (await as(subRoleSigner)).put(BASE).send({ type: "text", text: "president" })
  })

  it("403 for Super Admin too — the directory is strictly Admin-only (role gate)", async () => {
    const sa = await seed.superAdmin({ name: "Dir Hard SA" })
    const api = await as(sa)
    const res = await api.get(`${BASE}/directory`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Access denied. Required role: Admin")
  })

  it("403 for Maintenance Staff (second unauthorized role)", async () => {
    const api = await as(await seed.maintenanceStaff())
    const res = await api.get(`${BASE}/directory`)
    expect(res.status).toBe(403)
  })

  it("surfaces subRole and uses it as the position fallback for staff signers", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/directory`).query({ search: "dir hard subrole" })
    expect(res.status).toBe(200)
    expect(res.body.data.signatories).toHaveLength(1)
    expect(res.body.data.signatories[0]).toMatchObject({
      userId: String(subRoleSigner._id),
      role: "Gymkhana",
      subRole: "President Gymkhana",
      position: "President Gymkhana",
      type: "text",
      hasImage: false,
    })
  })

  it("search matches substrings case-insensitively", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/directory`).query({ search: "hard SUB" })
    expect(res.status).toBe(200)
    expect(res.body.data.signatories.map((s) => s.name)).toEqual(["Dir Hard Subrole Signer"])
  })

  it("SUSPECTED BUG: regex metacharacters in search are unescaped and crash with a 500", async () => {
    // listSignatories interpolates `search` straight into $regex without escaping,
    // so "[" raises a Mongo regular-expression error handled as a 500.
    const api = await as(admin)
    const res = await api.get(`${BASE}/directory`).query({ search: "[" })
    expect(res.status).toBe(500)
    expect(res.body.success).toBe(false)
  })
})
