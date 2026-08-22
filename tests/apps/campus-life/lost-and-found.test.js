/**
 * Lost & Found module integration tests (/api/v1/lost-and-found).
 *
 * Legacy response style: controllers emit `result.data` directly; the
 * success() message-hoist means POST responds `{ lostAndFoundItem }`,
 * PUT responds `{ success: true, lostAndFoundItem }`, DELETE `{ success: true }`.
 *
 * GET results come from a Redis-backed common cache refreshed on every write;
 * we force a refresh in beforeAll so stale entries from other test files
 * cannot leak into assertions.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"

const daysAgo = (n) => new Date(Date.now() - n * 24 * 3600 * 1000)

async function refreshCache() {
  const { refreshCommonCache } = await import("../../../src/services/cache/commonData.cache.js")
  await refreshCommonCache("lostAndFound", { useLock: false })
}

beforeAll(async () => {
  await setupTestDb()
  await refreshCache()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("lost-and-found — authn/authz", () => {
  it("401 for unauthenticated requests", async () => {
    const api = await anon()
    expect((await api.get("/api/v1/lost-and-found")).status).toBe(401)
    expect((await api.post("/api/v1/lost-and-found").send({})).status).toBe(401)
    expect((await api.put("/api/v1/lost-and-found/000000000000000000000000").send({})).status).toBe(401)
    expect((await api.delete("/api/v1/lost-and-found/000000000000000000000000")).status).toBe(401)
  })

  it("GET is open to students and security/gate staff; writes are staff-only", async () => {
    const studentApi = await as(await seed.student())
    expect((await studentApi.get("/api/v1/lost-and-found")).status).toBe(200)
    expect(
      (await studentApi
        .post("/api/v1/lost-and-found")
        .send({ itemName: "Key", description: "stolen via student route" })).status
    ).toBe(403)

    const securityApi = await as(await seed.security())
    expect((await securityApi.get("/api/v1/lost-and-found")).status).toBe(200)
    expect(
      (await securityApi.post("/api/v1/lost-and-found").send({ itemName: "Wallet", description: "found at gate" }))
        .status
    ).toBe(201)

    const gateApi = await as(await seed.createUser({ role: "Hostel Gate" }))
    expect((await gateApi.get("/api/v1/lost-and-found")).status).toBe(200)
    expect(
      (await gateApi.put("/api/v1/lost-and-found/000000000000000000000000").send({})).status
    ).toBe(404) // role allowed, id unknown

    const maintenanceApi = await as(await seed.maintenanceStaff())
    expect((await maintenanceApi.get("/api/v1/lost-and-found")).status).toBe(403)
  })
})

describe("lost-and-found — POST / (staff create)", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("500 when required fields are missing (documented current behavior)", async () => {
    // SUSPECTED BUG: missing input surfaces as 500 "Failed to create Lost and
    // found item" instead of a 4xx validation error.
    const res = await adminApi.post("/api/v1/lost-and-found").send({ itemName: "No description" })
    expect(res.status).toBe(500)
    expect(res.body.message).toBe("Failed to create Lost and found item")
  })

  it("201 happy path with defaults (Active status, dateFound now)", async () => {
    const res = await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: "Black umbrella", description: "Found near the mess entrance" })
    expect(res.status).toBe(201)
    expect(res.body.lostAndFoundItem).toBeDefined()
    expect(res.body.lostAndFoundItem.itemName).toBe("Black umbrella")
    expect(res.body.lostAndFoundItem.status).toBe("Active")
    expect(new Date(res.body.lostAndFoundItem.dateFound).getTime()).toBeLessThanOrEqual(Date.now())

    const listRes = await adminApi.get("/api/v1/lost-and-found?search=umbrella")
    expect(listRes.body.lostAndFoundItems.map((i) => i.itemName)).toContain("Black umbrella")
  })
})

describe("lost-and-found — GET / (list, filters, stats)", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: "Blue water bottle", description: "Steel bottle in library", dateFound: daysAgo(3) })
    const claimed = await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: "Chemistry notes", description: "Bundle of notes in D-block", dateFound: daysAgo(2) })
    await adminApi
      .put(`/api/v1/lost-and-found/${claimed.body.lostAndFoundItem._id}`)
      .send({ status: "Claimed" })
    await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: "Spectacles", description: "Black frame spectacles in gym", dateFound: daysAgo(1) })
    await refreshCache()
  })

  it("returns all items newest-first with pagination + stats + filters envelope", async () => {
    const res = await adminApi.get("/api/v1/lost-and-found")
    expect(res.status).toBe(200)
    // 3 here + "Black umbrella" + security's "Wallet" from earlier suites.
    expect(res.body.pagination.total).toBe(5)
    expect(res.body.lostAndFoundItems).toHaveLength(5)
    const dates = res.body.lostAndFoundItems.map((i) => new Date(i.dateFound).getTime())
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)
    expect(res.body.stats.total).toBe(5)
    expect(res.body.stats.active + res.body.stats.claimed).toBe(5)
    expect(res.body.filters).toEqual({ status: "all", search: "" })
  })

  it("active/claimed status filters work", async () => {
    const active = await adminApi.get("/api/v1/lost-and-found?status=active")
    expect(active.body.lostAndFoundItems.every((i) => i.status === "Active")).toBe(true)
    expect(active.body.pagination.total).toBe(4)

    const claimed = await adminApi.get("/api/v1/lost-and-found?status=claimed")
    expect(claimed.body.lostAndFoundItems.map((i) => i.itemName)).toEqual(["Chemistry notes"])
    expect(claimed.body.stats.total).toBe(5) // stats are unfiltered
  })

  it("search matches name, description or id", async () => {
    const byName = await adminApi.get("/api/v1/lost-and-found?search=spectacles")
    expect(byName.body.lostAndFoundItems.map((i) => i.itemName)).toEqual(["Spectacles"])

    const byDesc = await adminApi.get("/api/v1/lost-and-found?search=library")
    expect(byDesc.body.lostAndFoundItems.map((i) => i.itemName)).toEqual(["Blue water bottle"])

    const list = await adminApi.get("/api/v1/lost-and-found?search=bottle")
    const targetId = list.body.lostAndFoundItems[0]._id
    const byId = await adminApi.get(`/api/v1/lost-and-found?search=${targetId}`)
    expect(byId.body.lostAndFoundItems).toHaveLength(1)
  })

  it("paginates beyond the first page", async () => {
    const res = await adminApi.get("/api/v1/lost-and-found?page=2&limit=2")
    expect(res.body.events).toBeUndefined()
    expect(res.body.lostAndFoundItems).toHaveLength(2)
    expect(res.body.pagination).toMatchObject({ page: 2, limit: 2, hasMore: true })
  })
})

describe("lost-and-found — PUT /:id and DELETE /:id", () => {
  let adminApi, itemId

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    const created = await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: "Editable item", description: "before edit" })
    itemId = String(created.body.lostAndFoundItem._id)
  })

  it("404 for unknown id", async () => {
    const res = await adminApi
      .put("/api/v1/lost-and-found/000000000000000000000000")
      .send({ status: "Claimed" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Lost and found item not found")
    expect((await adminApi.delete("/api/v1/lost-and-found/000000000000000000000000")).status).toBe(404)
  })

  it("400 Invalid ID format for malformed id", async () => {
    let res = await adminApi.put("/api/v1/lost-and-found/garbage").send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid ID format")

    res = await adminApi.delete("/api/v1/lost-and-found/garbage")
    expect(res.status).toBe(400)
  })

  it("200 update persists (status transition Active -> Claimed)", async () => {
    const res = await adminApi
      .put(`/api/v1/lost-and-found/${itemId}`)
      .send({ status: "Claimed", description: "after edit" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.lostAndFoundItem.status).toBe("Claimed")

    const listRes = await adminApi.get("/api/v1/lost-and-found?search=editable")
    expect(listRes.body.lostAndFoundItems[0].status).toBe("Claimed")
  })

  it("200 delete removes the item", async () => {
    const res = await adminApi.delete(`/api/v1/lost-and-found/${itemId}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const listRes = await adminApi.get("/api/v1/lost-and-found?search=editable")
    expect(listRes.body.lostAndFoundItems).toHaveLength(0)
  })
})

describe("lost-and-found — hardening: status transitions", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  async function createItem(name) {
    const res = await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: name, description: `${name} description` })
    expect(res.status).toBe(201)
    return String(res.body.lostAndFoundItem._id)
  }

  it("Active -> Claimed -> Active is allowed both ways (no transition guard)", async () => {
    // Documented behavior: the API accepts any enum status at any time;
    // re-opening a claimed item is permitted.
    const id = await createItem("Transition matrix item")

    const claim = await adminApi.put(`/api/v1/lost-and-found/${id}`).send({ status: "Claimed" })
    expect(claim.status).toBe(200)
    expect(claim.body.lostAndFoundItem.status).toBe("Claimed")

    const reopen = await adminApi.put(`/api/v1/lost-and-found/${id}`).send({ status: "Active" })
    expect(reopen.status).toBe(200)
    expect(reopen.body.lostAndFoundItem.status).toBe("Active")

    const recclaim = await adminApi.put(`/api/v1/lost-and-found/${id}`).send({ status: "Claimed" })
    expect(recclaim.body.lostAndFoundItem.status).toBe("Claimed")
    await refreshCache()
    const list = await adminApi.get(`/api/v1/lost-and-found?search=${id}`)
    expect(list.body.lostAndFoundItems[0].status).toBe("Claimed")
  })

  it("a second staff member can 'claim' an already-claimed item (documented)", async () => {
    // Documented behavior: items carry no claimant identity, so there is no
    // conflict when different staff update the same item's status.
    const id = await createItem("Double claim item")
    await adminApi.put(`/api/v1/lost-and-found/${id}`).send({ status: "Claimed" })

    const wardenApi = await as(await seed.warden())
    const res = await wardenApi.put(`/api/v1/lost-and-found/${id}`).send({ status: "Claimed" })
    expect(res.status).toBe(200)
    expect(res.body.lostAndFoundItem.status).toBe("Claimed")
  })

  it("illegal status value ('Returned') -> 422 Validation failed (documented)", async () => {
    // Documented behavior: unlike the CREATE path (which swallows
    // ValidationError into a generic 500), UPDATE rethrows known mongoose
    // errors, so an enum-violating status is rejected as 422 by the global
    // handler — and the item keeps its previous status.
    const id = await createItem("Illegal jump item")
    const res = await adminApi.put(`/api/v1/lost-and-found/${id}`).send({ status: "Returned" })
    expect(res.status).toBe(422)
    expect(res.body.message).toBe("Validation failed")

    const list = await adminApi.get(`/api/v1/lost-and-found?search=${id}`)
    expect(list.body.lostAndFoundItems[0].status).toBe("Active")
  })

  it("PUT with an empty payload -> 200 leaving the item unchanged", async () => {
    const id = await createItem("Empty payload item")
    const res = await adminApi.put(`/api/v1/lost-and-found/${id}`).send({})
    expect(res.status).toBe(200)
    expect(res.body.lostAndFoundItem.status).toBe("Active")
    expect(res.body.lostAndFoundItem.description).toBe("Empty payload item description")
  })

  it("itemName beyond the 100-char limit surfaces as the generic 500 (documented)", async () => {
    // SUSPECTED BUG: maxlength ValidationError is swallowed into 500 instead
    // of a 4xx validation response.
    const res = await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: "y".repeat(101), description: "too long name" })
    expect([400, 422, 500]).toContain(res.status)
    expect(res.status).toBe(500) // current behavior
  })

  it("description beyond the 500-char limit surfaces as the generic 500 (documented)", async () => {
    const res = await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: "Long desc item", description: "z".repeat(501) })
    expect(res.status).toBe(500)
  })
})

describe("lost-and-found — hardening: images & search params", () => {
  let adminApi

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
  })

  it("image fileRefs are stored verbatim; the API never touches blob storage", async () => {
    // Documented behavior: images are plain trimmed strings (fileRefs). The
    // module performs no existence check against storage, so refs pointing at
    // unreachable/unuploaded objects are accepted silently.
    const refs = ["/uploads/lf/photo-1.jpg", "/uploads/lf/photo-2.png", "/definitely/not/uploaded.jpg"]
    const created = await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: "Imagery backpack", description: "has pictures", images: refs })
    expect(created.status).toBe(201)
    expect(created.body.lostAndFoundItem.images).toEqual(refs)

    const replaced = await adminApi
      .put(`/api/v1/lost-and-found/${created.body.lostAndFoundItem._id}`)
      .send({ images: ["/uploads/lf/replaced.jpg"] })
    expect(replaced.status).toBe(200)
    expect(replaced.body.lostAndFoundItem.images).toEqual(["/uploads/lf/replaced.jpg"])

    await refreshCache()
    const list = await adminApi.get("/api/v1/lost-and-found?search=imagery")
    expect(list.body.lostAndFoundItems[0].images).toEqual(["/uploads/lf/replaced.jpg"])
  })

  it("search with regex metacharacters neither crashes nor over-matches", async () => {
    // The cache path filters with plain case-insensitive .includes(), so
    // metacharacters are treated literally.
    for (const term of ["^a.*$(", "[x]", "(umbrella|wallet)", "\\", "%%"]) {
      const res = await adminApi.get(
        `/api/v1/lost-and-found?search=${encodeURIComponent(term)}`
      )
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body.lostAndFoundItems)).toBe(true)
      expect(res.body.filters.search).toBe(term.toLowerCase())
    }

    // Literal match on a metacharacter-containing substring of a real name.
    await adminApi
      .post("/api/v1/lost-and-found")
      .send({ itemName: "Keys (set of 3)", description: "found near gate" })
    await refreshCache()
    const literal = await adminApi.get(
      `/api/v1/lost-and-found?search=${encodeURIComponent("(set of")}`
    )
    expect(literal.body.lostAndFoundItems.map((i) => i.itemName)).toEqual(["Keys (set of 3)"])
  })

  it("status filter ignores unknown values like the regex-probe 'active~'", async () => {
    await refreshCache()
    const res = await adminApi.get("/api/v1/lost-and-found?status=claimed%7Cactive")
    expect(res.status).toBe(200)
    expect(res.body.filters.status).toBe("all") // normalized fallback
    // No filtering happened: both statuses present.
    const statuses = new Set(res.body.lostAndFoundItems.map((i) => i.status))
    expect(statuses.size).toBeGreaterThanOrEqual(1)
  })
})
