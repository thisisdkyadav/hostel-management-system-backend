import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { saSeed } from "../../helpers/seed/student-affairs.js"

const BASE = "/api/v1/student-affairs/clubs"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("clubs admin management", () => {
  let admin
  let superAdmin
  let student
  let gsGymkhana
  let adminApi
  let studentApi
  let gymkhanaApi

  beforeAll(async () => {
    admin = await seed.admin()
    superAdmin = await seed.superAdmin()
    student = await seed.student()
    gsGymkhana = await saSeed.gymkhana("GS Gymkhana")
    adminApi = await as(admin)
    studentApi = await as(student)
    gymkhanaApi = await as(gsGymkhana)
  })

  it("GET / rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.get(BASE)
    expect(res.status).toBe(401)
  })

  it("GET / rejects students with 403", async () => {
    const res = await studentApi.get(BASE)
    expect(res.status).toBe(403)
  })

  it("GET / rejects Gymkhana users with 403 (admin-only listing)", async () => {
    const res = await gymkhanaApi.get(BASE)
    expect(res.status).toBe(403)
  })

  it("GET / returns an empty list plus the default GS categories", async () => {
    const res = await adminApi.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Clubs loaded successfully")
    expect(res.body.data.clubs).toEqual([])
    const keys = res.body.data.gymkhanaCategories.map((c) => c.key)
    for (const expected of ["academic", "cultural", "sports", "technical"]) {
      expect(keys).toContain(expected)
    }
  })

  it("POST / rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.post(BASE).send({})
    expect(res.status).toBe(401)
  })

  it("POST / rejects students with 403", async () => {
    const res = await studentApi.post(BASE).send({})
    expect(res.status).toBe(403)
  })

  it("POST / returns a validation error when fields are missing", async () => {
    const res = await adminApi.post(BASE).send({ name: "Half Defined" })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it("POST / rejects an unknown GS category with 400", async () => {
    const res = await adminApi.post(BASE).send({
      name: "Astronomy Club",
      email: "astro@hms.test",
      gymkhanaCategoryKey: "astronomy",
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/valid GS category/i)
  })

  it("POST / creates a club and its linked Gymkhana Club login", async () => {
    const res = await adminApi.post(BASE).send({
      name: "Dance Club",
      email: "dance@hms.test",
      gymkhanaCategoryKey: "cultural",
    })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Club created successfully")

    const club = res.body.data.club
    expect(club.name).toBe("Dance Club")
    expect(club.email).toBe("dance@hms.test")
    expect(club.gymkhanaCategoryKey).toBe("cultural")
    expect(club.gymkhanaCategoryLabel).toBe("Cultural")
    expect(club.userId).toBeTruthy()

    // Persistence via the list endpoint.
    const list = await adminApi.get(BASE)
    const found = list.body.data.clubs.find((c) => c.id === club.id)
    expect(found.name).toBe("Dance Club")
  })

  it("POST / accepts a category label as well as a key", async () => {
    const res = await adminApi.post(BASE).send({
      name: "Football Club",
      email: "football@hms.test",
      gymkhanaCategoryKey: "Sports",
    })
    expect(res.status).toBe(201)
    expect(res.body.data.club.gymkhanaCategoryKey).toBe("sports")
  })

  it("POST / returns 409 when the club email already exists", async () => {
    const res = await adminApi.post(BASE).send({
      name: "Dance Club Two",
      email: "dance@hms.test",
      gymkhanaCategoryKey: "cultural",
    })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/email already exists/i)
  })

  it("POST / returns 409 when the club name already exists", async () => {
    const res = await adminApi.post(BASE).send({
      name: "dance club",
      email: "dance2@hms.test",
      gymkhanaCategoryKey: "cultural",
    })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/name already exists/i)
  })

  it("POST / returns 409 when the email collides with an existing user", async () => {
    const res = await adminApi.post(BASE).send({
      name: "Robotics Club",
      email: String(student.email).toUpperCase(),
      gymkhanaCategoryKey: "technical",
    })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/user with this email/i)
  })

  it("PUT /:id returns 404 for an unknown club", async () => {
    const res = await adminApi
      .put(`${BASE}/000000000000000000000000`)
      .send({ name: "Ghost Club" })
    expect(res.status).toBe(404)
  })

  it("PUT /:id returns a validation error for an empty body", async () => {
    const list = await adminApi.get(BASE)
    const club = list.body.data.clubs[0]
    const res = await adminApi.put(`${BASE}/${club.id}`).send({})
    expect(res.status).toBe(422)
  })

  it("PUT /:id renames a club and syncs the linked login user", async () => {
    const list = await adminApi.get(BASE)
    const club = list.body.data.clubs.find((c) => c.name === "Dance Club")
    const res = await adminApi
      .put(`${BASE}/${club.id}`)
      .send({ name: "Performing Arts Club" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Club updated successfully")
    expect(res.body.data.club.name).toBe("Performing Arts Club")
  })

  it("PUT /:id returns 409 when renaming to an existing club's name", async () => {
    const list = await adminApi.get(BASE)
    const football = list.body.data.clubs.find((c) => c.name === "Football Club")
    const res = await adminApi
      .put(`${BASE}/${football.id}`)
      .send({ name: "performing arts club" })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/name already exists/i)
  })

  it("PUT /:id returns 409 when moving the email to an existing user's email", async () => {
    const list = await adminApi.get(BASE)
    const football = list.body.data.clubs.find((c) => c.name === "Football Club")
    const res = await adminApi
      .put(`${BASE}/${football.id}`)
      .send({ email: String(admin.email).toUpperCase() })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/user with this email/i)
  })

  it("PUT /:id updates the GS category", async () => {
    const list = await adminApi.get(BASE)
    const football = list.body.data.clubs.find((c) => c.name === "Football Club")
    const res = await adminApi
      .put(`${BASE}/${football.id}`)
      .send({ gymkhanaCategoryKey: "Technical" })
    expect(res.status).toBe(200)
    expect(res.body.data.club.gymkhanaCategoryKey).toBe("technical")
    expect(res.body.data.club.gymkhanaCategoryLabel).toBe("Technical")
  })
})

describe("clubs portal (/me)", () => {
  let adminApi
  let clubUser
  let club

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    const res = await adminApi.post(BASE).send({
      name: "Chess Club",
      email: "chess@hms.test",
      gymkhanaCategoryKey: "sports",
    })
    club = res.body.data.club
    clubUser = await saSeed.userById(club.userId)
  })

  it("GET /me rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/me`)
    expect(res.status).toBe(401)
  })

  it("GET /me rejects non-Gymkhana roles with 403", async () => {
    const api = await as(await seed.student())
    const res = await api.get(`${BASE}/me`)
    expect(res.status).toBe(403)
  })

  it("GET /me rejects Gymkhana users without the Club subRole with 403", async () => {
    const api = await as(await saSeed.gymkhana("President Gymkhana"))
    const res = await api.get(`${BASE}/me`)
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Only club accounts/i)
  })

  it("GET /me returns 404 for a Club-subRole user without a club document", async () => {
    const orphan = await saSeed.gymkhana("Club")
    const api = await as(orphan)
    const res = await api.get(`${BASE}/me`)
    expect(res.status).toBe(404)
    expect(res.body.message).toContain("Club")
  })

  it("GET /me returns the caller's club for a club account", async () => {
    const api = await as(clubUser)
    const res = await api.get(`${BASE}/me`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Club loaded successfully")
    expect(res.body.data.club.id).toBe(String(club.id))
    expect(res.body.data.club.name).toBe("Chess Club")
    expect(res.body.data.club.email).toBe("chess@hms.test")
  })

  it("GET /me reflects admin updates to the club (rename + email change)", async () => {
    const rename = await adminApi
      .put(`${BASE}/${club.id}`)
      .send({ name: "Chess Society", email: "chess-society@hms.test" })
    expect(rename.status).toBe(200)

    const api = await as(clubUser)
    const res = await api.get(`${BASE}/me`)
    expect(res.status).toBe(200)
    expect(res.body.data.club.name).toBe("Chess Society")
    expect(res.body.data.club.email).toBe("chess-society@hms.test")
  })
})

describe("clubs hardening: field-level validation, credential flows, rename side effects", () => {
  let adminApi
  let superAdminApi
  let studentApi
  let clubUser
  let club

  beforeAll(async () => {
    adminApi = await as(await seed.admin())
    superAdminApi = await as(await seed.superAdmin())
    studentApi = await as(await seed.student())

    const created = await adminApi.post(BASE).send({
      name: "Debate Club",
      email: "debate@hms.test",
      gymkhanaCategoryKey: "academic",
    })
    expect(created.status).toBe(201)
    club = created.body.data.club
    clubUser = await saSeed.userById(club.userId)
  })

  // ---------- create with missing/invalid fields one at a time ----------
  it("POST / rejects a missing email with a validation error", async () => {
    const res = await adminApi.post(BASE).send({
      name: "Emailless Club",
      gymkhanaCategoryKey: "sports",
    })
    expect(res.status).toBe(422)
  })

  it("POST / rejects a missing GS category with a validation error", async () => {
    const res = await adminApi.post(BASE).send({
      name: "Categoriless Club",
      email: "categoriless@hms.test",
    })
    expect(res.status).toBe(422)
  })

  it("POST / rejects a too-short name with a validation error", async () => {
    const res = await adminApi.post(BASE).send({
      name: "A",
      email: "short-name@hms.test",
      gymkhanaCategoryKey: "sports",
    })
    expect(res.status).toBe(422)
  })

  it("POST / rejects a malformed email with a validation error", async () => {
    const res = await adminApi.post(BASE).send({
      name: "Malformed Email Club",
      email: "not-an-email",
      gymkhanaCategoryKey: "sports",
    })
    expect(res.status).toBe(422)
  })

  it("POST / rejects an empty GS category string with a validation error (enum lower bound)", async () => {
    const res = await adminApi.post(BASE).send({
      name: "Empty Category Club",
      email: "empty-category@hms.test",
      gymkhanaCategoryKey: "   ",
    })
    expect(res.status).toBe(422)
  })

  it("POST / is allowed for Super Admin (unmapped-role fall-through)", async () => {
    const res = await superAdminApi.post(BASE).send({
      name: "Super Club",
      email: "super-club@hms.test",
      gymkhanaCategoryKey: "technical",
    })
    expect(res.status).toBe(201)
  })

  // ---------- login-as-club credential flows ----------
  it("the linked club login cannot list clubs (admin-only route)", async () => {
    const res = await as(clubUser).then((api) => api.get(BASE))
    expect(res.status).toBe(403)
  })

  it("the linked club login cannot create clubs", async () => {
    const api = await as(clubUser)
    const res = await api.post(BASE).send({
      name: "Rogue Club",
      email: "rogue@hms.test",
      gymkhanaCategoryKey: "sports",
    })
    expect(res.status).toBe(403)
  })

  it("the linked club login cannot update its own club document", async () => {
    const api = await as(clubUser)
    const res = await api.put(`${BASE}/${club.id}`).send({ name: "Self Promoted Club" })
    expect(res.status).toBe(403)
  })

  it("PUT /:id rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.put(`${BASE}/${club.id}`).send({ name: "Nope" })
    expect(res.status).toBe(401)
  })

  it("PUT /:id rejects students with 403", async () => {
    const res = await studentApi.put(`${BASE}/${club.id}`).send({ name: "Nope" })
    expect(res.status).toBe(403)
  })

  // ---------- rename sync side effects ----------
  it("renaming to the same value is a conflict-free no-op and keeps the club usable", async () => {
    const res = await adminApi
      .put(`${BASE}/${club.id}`)
      .send({ name: "Debate Club", email: "debate@hms.test" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Club updated successfully")
    expect(res.body.data.club.name).toBe("Debate Club")

    // The linked login still resolves.
    const me = await as(clubUser).then((api) => api.get(`${BASE}/me`))
    expect(me.status).toBe(200)
    expect(me.body.data.club.id).toBe(String(club.id))
  })

  it("renaming syncs the linked login user's name for future sessions", async () => {
    const res = await adminApi
      .put(`${BASE}/${club.id}`)
      .send({ name: "Debate Society" })
    expect(res.status).toBe(200)

    // Fresh session fabricated from the re-fetched user doc carries the new name.
    const refreshed = await saSeed.userById(club.userId)
    expect(refreshed.name).toBe("Debate Society")
    const me = await as(refreshed).then((api) => api.get(`${BASE}/me`))
    expect(me.body.data.club.name).toBe("Debate Society")
  })

  it("PUT /:id rejects an unknown category with the service-level 400", async () => {
    const res = await adminApi
      .put(`${BASE}/${club.id}`)
      .send({ gymkhanaCategoryKey: "underwater-basket-weaving" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/valid GS category/i)
  })

  it("PUT /:id returns 409 when renaming to a name that differs only by case/whitespace", async () => {
    const list = await adminApi.get(BASE)
    const other = list.body.data.clubs.find((c) => c.id !== String(club.id))
    const res = await adminApi
      .put(`${BASE}/${club.id}`)
      .send({ name: `  ${other.name.toUpperCase()}  ` })
    expect(res.status).toBe(409)
    expect(res.body.message).toMatch(/name already exists/i)
  })
})
