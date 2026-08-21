import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { patchSessionHostel } from "../../helpers/seed/operations.js"
import {
  createStudentProfile,
  createHostel,
  createRoom,
  createAllocation,
  setConfig,
} from "../../helpers/seed/students.js"

const BASE = "/api/v1/students/profiles-admin"

let counter = 0
const uniq = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

// ---------------------------------------------------------------------------
// Shared fixtures (created once; describes below depend on this roster)
// ---------------------------------------------------------------------------
let admin
let superAdmin
let plainStudent
let wardenUser
let supervisorUser
let adminApi
let superAdminApi
let studentApi
let wardenApi // warden WITHOUT a hostel (reads fail open)
let wardenHostelAApi // warden WITH hostelA patched into the session
let supervisorApi // hostel supervisor WITH hostelA patched into the session

let hostelA
let hostelB
let roomA101 // cap 2 in hostelA
let roomA102 // cap 2 in hostelA (allocation-write tests)
let roomB201 // cap 1 in hostelB

let sA1 // ADM001 allocated @ hostelA/A101/bed1
let sA2 // ADM002 unallocated
let sB1 // ADM003 allocated @ hostelB/B201/bed1
let sDeal // ADM004 allocated @ hostelA/A101/bed2 (graduated later -> deallocated)
let sNum // 10000001 unallocated (numeric-roll range tests)
let sExtra // ADM005 unallocated (capacity/day-scholar tests)
let sStatus // ADM006 unallocated (status-transition tests)

beforeAll(async () => {
  admin = await seed.admin()
  superAdmin = await seed.superAdmin()
  plainStudent = await seed.student()
  wardenUser = await seed.warden()
  supervisorUser = await seed.hostelSupervisor()

  adminApi = await as(admin)
  superAdminApi = await as(superAdmin)
  studentApi = await as(plainStudent)
  wardenApi = await as(wardenUser)

  hostelA = await createHostel({ name: "Alpha Bhavan", type: "room-only" })
  hostelB = await createHostel({ name: "Beta Bhavan", type: "room-only" })
  roomA101 = await createRoom({ hostelId: hostelA._id, roomNumber: "A101", capacity: 2 })
  roomA102 = await createRoom({ hostelId: hostelA._id, roomNumber: "A102", capacity: 2 })
  roomB201 = await createRoom({ hostelId: hostelB._id, roomNumber: "B201", capacity: 1 })

  const mkStudent = async (rollNumber, extra = {}) => {
    const user = await seed.student()
    const profile = await createStudentProfile({
      userId: user._id,
      rollNumber,
      degree: "BTech",
      department: "CSE",
      ...extra,
    })
    return { user, profile }
  }

  sA1 = await mkStudent("ADM001")
  sA2 = await mkStudent("ADM002")
  sB1 = await mkStudent("ADM003")
  sDeal = await mkStudent("ADM004")
  sNum = await mkStudent("10000001")
  sExtra = await mkStudent("ADM005")
  sStatus = await mkStudent("ADM006")

  await createAllocation({
    userId: sA1.user._id,
    studentProfileId: sA1.profile._id,
    hostelId: hostelA._id,
    roomId: roomA101._id,
    bedNumber: 1,
  })
  await createAllocation({
    userId: sDeal.user._id,
    studentProfileId: sDeal.profile._id,
    hostelId: hostelA._id,
    roomId: roomA101._id,
    bedNumber: 2,
  })
  await createAllocation({
    userId: sB1.user._id,
    studentProfileId: sB1.profile._id,
    hostelId: hostelB._id,
    roomId: roomB201._id,
    bedNumber: 1,
  })

  // Hostel-bound sessions: the fabricated session hardcodes hostel:null, so
  // patch the stored Redis session documents.
  supervisorApi = await as(supervisorUser)
  await patchSessionHostel(supervisorApi.cookie, hostelA)
  wardenHostelAApi = await as(wardenUser)
  await patchSessionHostel(wardenHostelAApi.cookie, hostelA)

  // Transactional allocation writes race async index builds on freshly created
  // collections ("Unable to acquire IX lock"); build them up front.
  const models = await import("../../../src/models/index.js")
  for (const name of ["User", "StudentProfile", "Hostel", "Unit", "Room", "RoomAllocation"]) {
    await models[name].syncIndexes()
  }

  // Materialize taxonomy configs so rename endpoints find their docs.
  await setConfig("degrees", ["BTech"])
  await setConfig("departments", ["CSE", "ME"])
  await setConfig("studentGroups", [])
  await setConfig("studentBatches", {})
}, 90_000)

// ---------------------------------------------------------------------------
// Auth wall
// ---------------------------------------------------------------------------

describe("profiles-admin auth wall", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    expect((await api.get(`${BASE}/profiles`)).status).toBe(401)
    expect((await api.post(`${BASE}/profiles`).send([])).status).toBe(401)
    expect((await api.get(`${BASE}/taxonomy/options`)).status).toBe(401)
  })

  it("rejects students with 403", async () => {
    expect((await studentApi.get(`${BASE}/profiles`)).status).toBe(403)
    expect((await studentApi.post(`${BASE}/profiles`).send([])).status).toBe(403)
    expect((await studentApi.get(`${BASE}/departments/list`)).status).toBe(200) // lists allow Students
  })

  it("SUSPECTED BUG: Super Admin is denied by the unmapped routeGuard", async () => {
    // SUSPECTED BUG: routeGuard maps Admin/Warden/Associate Warden/Hostel
    // Supervisor but not Super Admin, and defaults to deny for unmapped roles —
    // so the highest-privileged account cannot browse student profiles here.
    const res = await superAdminApi.get(`${BASE}/profiles`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// GET /profiles — directory reads + hostel scoping
// ---------------------------------------------------------------------------

describe("GET /profiles", () => {
  it("lists all students for Admin with pagination metadata", async () => {
    const res = await adminApi.get(`${BASE}/profiles?limit=50`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Students fetched successfully")

    const rolls = res.body.data.students.map((s) => s.rollNumber)
    expect(rolls).toContain("ADM001")
    expect(rolls).toContain("ADM003")

    const { pagination } = res.body.data
    expect(pagination.total).toBeGreaterThanOrEqual(6)
    expect(pagination.limit).toBe(50)
    expect(res.body.data.meta.missingOptions.length).toBeGreaterThan(0)
  })

  it("supports roll-number search", async () => {
    const res = await adminApi.get(`${BASE}/profiles?rollNumber=ADM001`)
    expect(res.status).toBe(200)
    expect(res.body.data.students).toHaveLength(1)
    expect(res.body.data.students[0].rollNumber).toBe("ADM001")
    expect(res.body.data.students[0].hostel).toBe("Alpha Bhavan")
  })

  it("scopes Hostel Supervisors to their active hostel", async () => {
    const res = await supervisorApi.get(`${BASE}/profiles`)
    expect(res.status).toBe(200)
    const rolls = res.body.data.students.map((s) => s.rollNumber)
    expect(rolls).toContain("ADM001") // allocated in hostelA
    expect(rolls).not.toContain("ADM003") // allocated in hostelB
    expect(rolls).not.toContain("ADM002") // unallocated -> no hostel match
  })

  it("returns an empty list when a supervisor requests a foreign hostel", async () => {
    const res = await supervisorApi.get(`${BASE}/profiles?hostelId=${hostelB._id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.students).toEqual([])
    expect(res.body.data.pagination.total).toBe(0)
  })

  it("lets supervisors list unallocated students across hostels", async () => {
    const res = await supervisorApi.get(`${BASE}/profiles?hasAllocation=false&limit=100`)
    expect(res.status).toBe(200)
    const rolls = res.body.data.students.map((s) => s.rollNumber)
    expect(rolls).toContain("ADM002")
  })

  it("SUSPECTED BUG: a hostel-bound warden with no active hostel sees EVERYTHING on reads", async () => {
    // SUSPECTED BUG: getConstraintContext only scopes when req.user.hostel is
    // set, regardless of role — a warden whose session lost its hostel gets an
    // unscoped directory (writes fail closed, reads fail open).
    const res = await wardenApi.get(`${BASE}/profiles?limit=100`)
    expect(res.status).toBe(200)
    const rolls = res.body.data.students.map((s) => s.rollNumber)
    expect(rolls).toContain("ADM003") // belongs to another hostel
  })

  it("scopes a warden with an active hostel like supervisors", async () => {
    const res = await wardenHostelAApi.get(`${BASE}/profiles`)
    expect(res.status).toBe(200)
    const rolls = res.body.data.students.map((s) => s.rollNumber)
    expect(rolls).toContain("ADM001")
    expect(rolls).not.toContain("ADM003")
  })
})

// ---------------------------------------------------------------------------
// POST /profiles — bulk create (Admin only)
// ---------------------------------------------------------------------------

describe("POST /profiles (bulk create)", () => {
  it("rejects non-Admin staff with 403", async () => {
    expect((await supervisorApi.post(`${BASE}/profiles`).send([])).status).toBe(403)
    expect((await wardenApi.post(`${BASE}/profiles`).send([])).status).toBe(403)
  })

  it("returns 400 for an empty payload", async () => {
    const res = await adminApi.post(`${BASE}/profiles`).send([])
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("No student data provided")
  })

  it("creates a single student and persists it", async () => {
    const email = `created-${uniq()}@hms.test`
    const res = await adminApi.post(`${BASE}/profiles`).send({
      name: "Created Student",
      email,
      rollNumber: `CR${uniq()}`.toUpperCase(),
      gender: "Male",
      isDayScholar: false,
    })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Student profile created successfully")
    expect(res.body.data.results.user._id).toBeTruthy()
    expect(res.body.data.results.profile.rollNumber).toBe(
      res.body.data.results.profile.rollNumber.toUpperCase()
    )
    expect(res.body.data.errors).toEqual([])

    // Persistence through the directory.
    const list = await adminApi.get(
      `${BASE}/profiles?rollNumber=${res.body.data.results.profile.rollNumber}`
    )
    expect(list.body.data.students).toHaveLength(1)
    expect(list.body.data.students[0].name).toBe("Created Student")
  })

  it("reports per-row validation problems with 207", async () => {
    const res = await adminApi.post(`${BASE}/profiles`).send([
      { name: "No Gender", email: `x-${uniq()}@hms.test`, rollNumber: `XX${uniq()}`.toUpperCase(), isDayScholar: true },
      { name: "Bad Gender", email: `y-${uniq()}@hms.test`, rollNumber: `YY${uniq()}`.toUpperCase(), gender: "Alien", isDayScholar: false },
    ])
    expect(res.status).toBe(207)
    expect(res.body.success).toBe(true)
    expect(res.body.data.errors).toHaveLength(2)
    expect(res.body.data.results).toEqual([])
  })

  it("rejects duplicates against existing records with 207", async () => {
    const roll = `DUP${uniq()}`.toUpperCase()
    const first = await adminApi.post(`${BASE}/profiles`).send({
      name: "Dup One", email: `dup-${uniq()}@hms.test`, rollNumber: roll, gender: "Male", isDayScholar: false,
    })
    expect(first.status).toBe(201)

    const clashEmail = await adminApi.post(`${BASE}/profiles`).send({
      name: "Clash", email: admin.email, rollNumber: `OK${uniq()}`.toUpperCase(), gender: "Male", isDayScholar: false,
    })
    expect(clashEmail.status).toBe(207)
    expect(clashEmail.body.data.errors[0].message).toContain("already exists")

    const clashRoll = await adminApi.post(`${BASE}/profiles`).send({
      name: "Clash Roll", email: `fresh-${uniq()}@hms.test`, rollNumber: roll, gender: "Male", isDayScholar: false,
    })
    expect(clashRoll.status).toBe(207)
    expect(clashRoll.body.data.errors[0].message).toContain(`Roll number ${roll} already exists`)
  })
})

// ---------------------------------------------------------------------------
// PUT /profiles — bulk update (capability-gated)
// ---------------------------------------------------------------------------

describe("PUT /profiles (bulk update)", () => {
  it("denies wardens with 403 (cap.students.edit.personal denied by default)", async () => {
    const res = await wardenApi.put(`${BASE}/profiles`).send([{ rollNumber: "ADM001", name: "X" }])
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("updates name+phone for an Admin and persists the change", async () => {
    const res = await adminApi
      .put(`${BASE}/profiles`)
      .send([{ rollNumber: "adm002", name: "Renamed Via Bulk", phone: "9876500000" }])
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Updated 1 out of 1 student profiles")
    expect(res.body.data.results[0].rollNumber).toBe("ADM002")
    expect(res.body.data.results[0].updated.user).toBe(true)

    const details = await adminApi.get(`${BASE}/profile/details/${sA2.user._id}`)
    expect(details.body.data.student.name).toBe("Renamed Via Bulk")
    expect(details.body.data.student.phone).toBe("9876500000")
  })

  it("reports unknown roll numbers as per-row errors with 207", async () => {
    const res = await adminApi.put(`${BASE}/profiles`).send([
      { rollNumber: "NOSUCH1", name: "Ghost" },
    ])
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0].message).toBe("Student with roll number NOSUCH1 not found")
  })

  it("scopes supervisors to their own hostel (foreign rolls are 'not found')", async () => {
    const res = await supervisorApi
      .put(`${BASE}/profiles`)
      .send([{ rollNumber: "ADM003", name: "Hijack Attempt" }])
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0].message).toBe(
      "Student with roll number ADM003 not found in your hostel"
    )
  })

  it("rejects unconfigured batch assignments with a per-row error", async () => {
    const res = await adminApi
      .put(`${BASE}/profiles`)
      .send([{ rollNumber: "ADM002", degree: "BTech", department: "CSE", batch: "NOPE" }])
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0].message).toContain('Batch "NOPE" is not configured')
  })
})

// ---------------------------------------------------------------------------
// POST /profiles/ids + POST /profiles/export
// ---------------------------------------------------------------------------

describe("POST /profiles/ids", () => {
  it("returns 400 when userIds is missing", async () => {
    const res = await adminApi.post(`${BASE}/profiles/ids`).send({})
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Please provide an array of user IDs")
  })

  it("fetches multiple profiles for Admin", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/ids`)
      .send({ userIds: [String(sA1.user._id), String(sA2.user._id)] })
    expect(res.status).toBe(200)
    expect(res.body.data.students.map((s) => String(s.userId)).sort()).toEqual(
      [String(sA1.user._id), String(sA2.user._id)].sort()
    )
    expect(res.body.data.errors).toEqual([])
  })

  it("reports missing ids with 207", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/ids`)
      .send({ userIds: [String(sA1.user._id), "000000000000000000000000"] })
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0].message).toContain("not found")
  })

  it("filters foreign-hostel students out for supervisors with 207", async () => {
    const res = await supervisorApi
      .post(`${BASE}/profiles/ids`)
      .send({ userIds: [String(sA1.user._id), String(sB1.user._id)] })
    expect(res.status).toBe(207)
    expect(res.body.data.students.map((s) => String(s.userId))).toEqual([String(sA1.user._id)])
    expect(res.body.data.errors[0].userId).toBe(String(sB1.user._id))
  })
})

describe("POST /profiles/export", () => {
  it("rejects an invalid mode with 400", async () => {
    const res = await adminApi.post(`${BASE}/profiles/export`).send({ mode: "bogus" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid export mode")
  })

  it("exports by rollNumbers in request order", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/export`)
      .send({ mode: "rollNumbers", rollNumbers: ["adm003", "ADM001"] })
    expect(res.status).toBe(200)
    expect(res.body.data.totalMatched).toBe(2)
    expect(res.body.data.students.map((s) => s.rollNumber)).toEqual(["ADM003", "ADM001"])
  })

  it("reports unknown roll numbers alongside matches with 207", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/export`)
      .send({ mode: "rollNumbers", rollNumbers: ["ADM001", "GHOST99"] })
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0]).toMatchObject({ rollNumber: "GHOST99" })
    expect(res.body.data.students.map((s) => s.rollNumber)).toEqual(["ADM001"])
  })

  it("SUSPECTED BUG: an export where NOTHING matched answers 200, not 207/404", async () => {
    // SUSPECTED BUG: the userIds.length === 0 early-return uses success(),
    // whose default status is 200 — so a fully-unmatched rollNumbers export is
    // reported as success:true / 200 with the errors buried in data.
    const res = await adminApi
      .post(`${BASE}/profiles/export`)
      .send({ mode: "rollNumbers", rollNumbers: ["GHOST99"] })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.errors[0]).toMatchObject({ rollNumber: "GHOST99" })
    expect(res.body.data.students).toEqual([])
  })

  it("exports by filters, scoped for supervisors", async () => {
    const adminRes = await adminApi.post(`${BASE}/profiles/export`).send({ mode: "filters", filters: {} })
    expect(adminRes.status).toBe(200)
    expect(adminRes.body.data.totalMatched).toBeGreaterThanOrEqual(6)

    const supRes = await supervisorApi.post(`${BASE}/profiles/export`).send({ mode: "filters", filters: {} })
    expect(supRes.status).toBe(200)
    const rolls = supRes.body.data.students.map((s) => s.rollNumber)
    expect(rolls).toContain("ADM001")
    expect(rolls).not.toContain("ADM003")
    expect(rolls).not.toContain("ADM002") // unallocated never matches a hostel filter
  })
})

// ---------------------------------------------------------------------------
// Single-student detail / id / update
// ---------------------------------------------------------------------------

describe("GET /profile/details/:userId + GET /id/:userId", () => {
  it("returns 404 for an unknown student", async () => {
    const res = await adminApi.get(`${BASE}/profile/details/000000000000000000000000`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Student profile not found not found")
  })

  it("returns the full profile for Admin", async () => {
    const res = await adminApi.get(`${BASE}/profile/details/${sA1.user._id}`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const student = res.body.data.student
    expect(student.rollNumber).toBe("ADM001")
    expect(student.hostel).toBe("Alpha Bhavan")
    expect(student.displayRoom).toBe("A101-1")
  })

  it("forbids supervisors reading foreign-hostel students with 403", async () => {
    const res = await supervisorApi.get(`${BASE}/profile/details/${sB1.user._id}`)
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("You are not allowed to view this student profile")
  })

  it("GET /id/:userId resolves the profile id (null when absent)", async () => {
    const res = await adminApi.get(`${BASE}/id/${sA1.user._id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.studentId).toBe(String(sA1.profile._id))

    const missing = await adminApi.get(`${BASE}/id/000000000000000000000000`)
    expect(missing.status).toBe(200)
    expect(missing.body.data.studentId).toBeNull()
  })
})

describe("PUT /profile/:userId", () => {
  it("denies wardens with 403 (capability)", async () => {
    const res = await wardenApi.put(`${BASE}/profile/${sA1.user._id}`).send({ name: "Nope" })
    expect(res.status).toBe(403)
  })

  it("updates academic/contact fields for Admin and persists them", async () => {
    const res = await adminApi.put(`${BASE}/profile/${sA1.user._id}`).send({
      gender: "Female",
      guardian: "New Guardian",
      guardianPhone: "9000011111",
      secondaryEmail: "sec@example.com",
      address: "Updated Address",
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Student profile updated successfully")

    const details = await adminApi.get(`${BASE}/profile/details/${sA1.user._id}`)
    const student = details.body.data.student
    expect(student.gender).toBe("Female")
    expect(student.guardian).toBe("New Guardian")
    expect(student.guardianPhone).toBe("9000011111")
    expect(student.secondaryEmail).toBe("sec@example.com")
    expect(student.address).toBe("Updated Address")
  })

  it("returns 404 for an unknown student", async () => {
    const res = await adminApi.put(`${BASE}/profile/000000000000000000000000`).send({ name: "X" })
    expect(res.status).toBe(404)
  })

  it("forbids supervisors updating foreign-hostel students with 403", async () => {
    const res = await supervisorApi.put(`${BASE}/profile/${sB1.user._id}`).send({ name: "Nope" })
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("You are not allowed to update this student profile")
  })
})

// ---------------------------------------------------------------------------
// Bulk tools: roll-number check + consistency check
// ---------------------------------------------------------------------------

describe("POST /profiles/check-roll-numbers", () => {
  it("rejects wardens with 403 (bulk tools are Admin + Hostel Supervisor)", async () => {
    const res = await wardenApi
      .post(`${BASE}/profiles/check-roll-numbers`)
      .send({ rollNumbers: ["ADM001"] })
    expect(res.status).toBe(403)
  })

  it("validates the payload with 422", async () => {
    const res = await adminApi.post(`${BASE}/profiles/check-roll-numbers`).send({ rollNumbers: [] })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it("checks against the whole system by default", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/check-roll-numbers`)
      .send({ rollNumbers: ["adm001", "ADM002", "GHOST777"] })
    expect(res.status).toBe(200)
    expect(res.body.data.foundCount).toBe(2)
    expect(res.body.data.missingRollNumbers).toEqual(["GHOST777"])
    expect(res.body.data.statusCounts.Active).toBe(2)
    expect(res.body.data.scopeLabel).toBe("System")
  })

  it("scopes the check to the supervisor's hostel", async () => {
    const res = await supervisorApi
      .post(`${BASE}/profiles/check-roll-numbers`)
      .send({ rollNumbers: ["ADM001", "ADM003"] }) // ADM003 lives in hostelB
    expect(res.status).toBe(200)
    expect(res.body.data.scopeLabel).toBe("Your hostel")
    expect(res.body.data.foundCount).toBe(1)
    expect(res.body.data.missingRollNumbers).toEqual(["ADM003"])
  })

  it("rejects unconfigured groups with 400", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/check-roll-numbers`)
      .send({ rollNumbers: ["ADM001"], scopeType: "group", groupName: "NoSuchGroup" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe('Group "NoSuchGroup" is not configured')
  })

  it("checks group membership once the group is configured", async () => {
    await setConfig("studentGroups", ["Sports"])
    const res = await adminApi
      .post(`${BASE}/profiles/check-roll-numbers`)
      .send({ rollNumbers: ["ADM001"], scopeType: "group", groupName: "sports" })
    expect(res.status).toBe(200)
    expect(res.body.data.scopeLabel).toBe("Group: Sports")
    expect(res.body.data.outOfScopeRollNumbers).toEqual(["ADM001"]) // not in the group yet
    expect(res.body.data.inScopeCount).toBe(0)
  })

  it("checks batch membership against the configured taxonomy", async () => {
    await setConfig("studentBatches", { BTech: { CSE: ["2023"] } })
    const res = await adminApi.post(`${BASE}/profiles/check-roll-numbers`).send({
      rollNumbers: ["ADM001"],
      scopeType: "batch",
      degree: "BTech",
      department: "CSE",
      batch: "2023",
    })
    expect(res.status).toBe(200)
    expect(res.body.data.scopeLabel).toBe("Batch: 2023 (BTech / CSE)")
    expect(res.body.data.outOfScopeRollNumbers).toEqual(["ADM001"]) // batch not assigned yet
  })
})

describe("POST /profiles/check-consistency", () => {
  it("rejects an empty array with 422 (Joi runs before the handler)", async () => {
    const res = await adminApi.post(`${BASE}/profiles/check-consistency`).send({ students: [] })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it("returns 400 when every provided row lacks roll number and email", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/check-consistency`)
      .send({ students: [{ name: "No Idents" }] })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Please provide at least one row with a roll number or email")
  })

  it("reports fully matching uploads as consistent", async () => {
    const res = await adminApi.post(`${BASE}/profiles/check-consistency`).send({
      students: [{ rollNumber: "ADM001", name: sA1.user.name, email: sA1.user.email }],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.matchingByRollCount).toBe(1)
    expect(res.body.data.notInSystemCount).toBe(0)
    expect(res.body.data.identityMismatchCount).toBe(0)
    expect(res.body.message).toBe("Uploaded student details match the system")
  })

  it("flags field mismatches and unknown rolls", async () => {
    const res = await adminApi.post(`${BASE}/profiles/check-consistency`).send({
      students: [
        { rollNumber: "ADM001", name: "Totally Wrong Name" },
        { rollNumber: "GHOST888", name: "Ghost" },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.notInSystem.map((r) => r.rollNumber)).toEqual(["GHOST888"])
    expect(res.body.data.fieldMismatchesByRoll).toHaveLength(1)
    expect(res.body.data.fieldMismatchesByRoll[0].mismatches[0].field).toBe("name")
    expect(res.body.message).toBe("Data consistency check completed with mismatches")
  })

  it("excludes foreign-hostel students for supervisors", async () => {
    const res = await supervisorApi
      .post(`${BASE}/profiles/check-consistency`)
      .send({ students: [{ rollNumber: "ADM003" }] }) // hostelB
    expect(res.status).toBe(200)
    expect(res.body.data.notInSystemCount).toBe(1) // invisible == not in system
  })
})

// ---------------------------------------------------------------------------
// Bulk tools: status + day-scholar
// ---------------------------------------------------------------------------

describe("POST /profiles/status", () => {
  it("denies wardens with 403", async () => {
    const res = await wardenApi
      .post(`${BASE}/profiles/status`)
      .send({ status: "Graduated", rollNumbers: ["ADM001"] })
    expect(res.status).toBe(403)
  })

  it("rejects invalid statuses with 400", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/status`)
      .send({ status: "Expelled", rollNumbers: ["ADM001"] })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Invalid status value")
  })

  it("requires at least one roll number", async () => {
    const res = await adminApi.post(`${BASE}/profiles/status`).send({ status: "Graduated" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Please provide at least one roll number")
  })

  it("graduates an allocated student and deallocates the bed", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/status`)
      .send({ status: "Graduated", rollNumbers: ["adm004"] })
    expect(res.status).toBe(200)
    expect(res.body.data.updatedCount).toBe(1)
    expect(res.body.data.deallocatedCount).toBe(1)
    expect(res.body.data.unsuccessfulRollNumbers).toEqual([])

    const details = await adminApi.get(`${BASE}/profile/details/${sDeal.user._id}`)
    expect(details.body.data.student.status).toBe("Graduated")
  })

  it("reports partial matches with unsuccessfulRollNumbers", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/status`)
      .send({ status: "Inactive", rollNumbers: ["ADM006", "GHOST001"] })
    expect(res.status).toBe(200)
    expect(res.body.data.updatedCount).toBe(1)
    expect(res.body.data.unsuccessfulRollNumbers).toEqual(["GHOST001"])

    const details = await adminApi.get(`${BASE}/profile/details/${sStatus.user._id}`)
    expect(details.body.data.student.status).toBe("Inactive")
  })

  it("returns 404 when nothing matched", async () => {
    const res = await adminApi
      .post(`${BASE}/profiles/status`)
      .send({ status: "Inactive", rollNumbers: ["GHOST001"] })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("No students found to update")
  })
})

describe("PUT /profiles/day-scholar", () => {
  it("rejects malformed payloads with 400", async () => {
    expect((await adminApi.put(`${BASE}/profiles/day-scholar`).send({})).status).toBe(400)
    expect((await adminApi.put(`${BASE}/profiles/day-scholar`).send({ data: [] })).status).toBe(400)
    expect((await adminApi.put(`${BASE}/profiles/day-scholar`).send({ data: {} })).status).toBe(400)
  })

  it("marks a student as a day scholar with details and verifies persistence", async () => {
    const res = await adminApi.put(`${BASE}/profiles/day-scholar`).send({
      data: {
        adm002: {
          isDayScholar: true,
          dayScholarDetails: {
            address: "12 Lake Road",
            ownerName: "Owner",
            ownerPhone: "8000000000",
            ownerEmail: "owner@example.com",
          },
        },
      },
    })
    expect(res.status).toBe(200)
    expect(res.body.data.results[0]).toMatchObject({ rollNumber: "ADM002", success: true, isDayScholar: true })

    const details = await adminApi.get(`${BASE}/profile/details/${sA2.user._id}`)
    expect(details.body.data.student.isDayScholar).toBe(true)
    expect(details.body.data.student.dayScholarDetails.address).toBe("12 Lake Road")
  })

  it("clears day-scholar details when flipped back to false", async () => {
    const res = await adminApi
      .put(`${BASE}/profiles/day-scholar`)
      .send({ data: { ADM002: { isDayScholar: false } } })
    expect(res.status).toBe(200)

    const details = await adminApi.get(`${BASE}/profile/details/${sA2.user._id}`)
    expect(details.body.data.student.isDayScholar).toBe(false)
    expect(details.body.data.student.dayScholarDetails).toBeNull()
  })

  it("reports unknown rolls with 207", async () => {
    const res = await adminApi
      .put(`${BASE}/profiles/day-scholar`)
      .send({ data: { GHOST002: { isDayScholar: true } } })
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0]).toMatchObject({ rollNumber: "GHOST002", error: "Student not found" })
  })
})

// ---------------------------------------------------------------------------
// Bulk tools: batch + groups (config-driven)
// ---------------------------------------------------------------------------

describe("PUT /profiles/batch", () => {
  beforeAll(async () => {
    await setConfig("studentBatches", { BTech: { CSE: ["2023", "2024"] } })
  })

  it("requires degree, department and batch", async () => {
    const res = await adminApi.put(`${BASE}/profiles/batch`).send({ degree: "BTech" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("degree, department, and batch are required")
  })

  it("rejects unconfigured combinations with 400", async () => {
    const res = await adminApi.put(`${BASE}/profiles/batch`).send({
      degree: "BTech",
      department: "CSE",
      batch: "1999",
      rollNumbers: ["ADM001"],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("The selected batch is not configured for the selected academic combination")
  })

  it("assigns a batch by explicit roll numbers", async () => {
    const res = await adminApi.put(`${BASE}/profiles/batch`).send({
      degree: "BTech",
      department: "CSE",
      batch: "2023",
      rollNumbers: ["ADM001"],
    })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      updatedCount: 1,
      selectionMode: "csv",
      assignmentMode: "append",
    })

    const details = await adminApi.get(`${BASE}/profile/details/${sA1.user._id}`)
    expect(details.body.data.student.batch).toBe("2023")
  })

  it("selects purely numeric rolls via range", async () => {
    const res = await adminApi.put(`${BASE}/profiles/batch`).send({
      degree: "BTech",
      department: "CSE",
      batch: "2024",
      rollNumberRange: { start: "10000000", end: "10000002" },
    })
    expect(res.status).toBe(200)
    expect(res.body.data.selectionMode).toBe("range")
    expect(res.body.data.updatedCount).toBe(1)

    const details = await adminApi.get(`${BASE}/profile/details/${sNum.user._id}`)
    expect(details.body.data.student.batch).toBe("2024")
  })

  it("errors when a range resolves to nobody", async () => {
    const res = await adminApi.put(`${BASE}/profiles/batch`).send({
      degree: "BTech",
      department: "CSE",
      batch: "2024",
      rollNumberRange: { start: "90000000", end: "90000001" },
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("No numeric students found in the provided roll number range")
  })

  it("replace mode clears the batch from everyone else holding it", async () => {
    // Give ADM002 the same batch first.
    await adminApi.put(`${BASE}/profiles/batch`).send({
      degree: "BTech", department: "CSE", batch: "2023", rollNumbers: ["ADM002"],
    })
    const res = await adminApi.put(`${BASE}/profiles/batch`).send({
      degree: "BTech",
      department: "CSE",
      batch: "2023",
      rollNumbers: ["ADM001"],
      assignmentMode: "replace",
    })
    expect(res.status).toBe(200)
    // Both ADM001 (from the append test above) and ADM002 held 2023; the wipe
    // clears both before re-assigning ADM001.
    expect(res.body.data.clearedCount).toBe(2)

    const details = await adminApi.get(`${BASE}/profile/details/${sA2.user._id}`)
    expect(details.body.data.student.batch).toBe("")
  })
})

describe("PUT /profiles/groups", () => {
  beforeAll(async () => {
    await setConfig("studentGroups", ["Club-A", "Club-B"])
  })

  it("requires at least one group", async () => {
    const res = await adminApi.put(`${BASE}/profiles/groups`).send({ rollNumbers: ["ADM001"] })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Please select at least one group")
  })

  it("rejects invalid assignment modes with 400", async () => {
    const res = await adminApi
      .put(`${BASE}/profiles/groups`)
      .send({ groupNames: ["Club-A"], rollNumbers: ["ADM001"], assignmentMode: "upsert" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("assignmentMode must be add, remove, or replace")
  })

  it("rejects unconfigured groups with 400", async () => {
    const res = await adminApi
      .put(`${BASE}/profiles/groups`)
      .send({ groupNames: ["Ghost-Group"], rollNumbers: ["ADM001"] })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("These groups are not configured: Ghost-Group")
  })

  it("adds groups, removes them, and supports replace clearing", async () => {
    const add = await adminApi
      .put(`${BASE}/profiles/groups`)
      .send({ groupNames: ["Club-A", "Club-B"], rollNumbers: ["ADM001", "ADM002"] })
    expect(add.status).toBe(200)
    expect(add.body.data.updatedCount).toBe(2)

    let details = await adminApi.get(`${BASE}/profile/details/${sA1.user._id}`)
    expect(details.body.data.student.groups.sort()).toEqual(["Club-A", "Club-B"])

    const remove = await adminApi
      .put(`${BASE}/profiles/groups`)
      .send({ groupNames: ["Club-B"], rollNumbers: ["ADM001"], assignmentMode: "remove" })
    expect(remove.status).toBe(200)
    details = await adminApi.get(`${BASE}/profile/details/${sA1.user._id}`)
    expect(details.body.data.student.groups).toEqual(["Club-A"])

    const replace = await adminApi
      .put(`${BASE}/profiles/groups`)
      .send({ groupNames: ["Club-B"], rollNumbers: ["ADM002"], assignmentMode: "replace" })
    expect(replace.status).toBe(200)
    expect(replace.body.data.clearedCount).toBe(1) // ADM002 held Club-B and was wiped of it
    details = await adminApi.get(`${BASE}/profile/details/${sA2.user._id}`)
    // Replace only clears/re-adds the SELECTED groups; Club-A survives.
    expect(details.body.data.student.groups.sort()).toEqual(["Club-A", "Club-B"])
  })
})

// ---------------------------------------------------------------------------
// Room allocations
// ---------------------------------------------------------------------------

describe("GET /room-allocations/student/:rollNumber", () => {
  it("returns 404 for an unknown roll number", async () => {
    const res = await adminApi.get(`${BASE}/room-allocations/student/GHOST000`)
    expect(res.status).toBe(404)
    // notFound() appends its own "not found" to the entity phrase.
    expect(res.body.message).toBe("Student profile not found not found")
  })

  it("shows the current allocation for an housed student", async () => {
    const res = await adminApi.get(`${BASE}/room-allocations/student/ADM001`)
    expect(res.status).toBe(200)
    const student = res.body.data.student
    expect(student.rollNumber).toBe("ADM001")
    expect(student.currentAllocation).toMatchObject({
      hostelName: "Alpha Bhavan",
      roomNumber: "A101",
      bedNumber: 1,
    })
  })

  it("returns a null allocation for unallocated students", async () => {
    const res = await adminApi.get(`${BASE}/room-allocations/student/ADM005`)
    expect(res.status).toBe(200)
    expect(res.body.data.student.currentAllocation).toBeNull()
  })

  it("forbids supervisors looking up students housed elsewhere with 403", async () => {
    const res = await supervisorApi.get(`${BASE}/room-allocations/student/ADM003`) // hostelB
    expect(res.status).toBe(403)
    expect(res.body.message).toContain("unallocated students or students in your active hostel")
  })

  it("allows supervisors to look up unallocated students", async () => {
    const res = await supervisorApi.get(`${BASE}/room-allocations/student/ADM005`)
    expect(res.status).toBe(200)
    expect(res.body.data.student.currentAllocation).toBeNull()
  })
})

describe("PUT /hostels/:hostelId/room-allocations", () => {
  it("rejects malformed hostel ids with 400", async () => {
    const res = await adminApi.put(`${BASE}/hostels/not-an-id/room-allocations`).send([])
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("A valid hostel must be selected")
  })

  it("returns 404 for an unknown but well-formed hostel id", async () => {
    const res = await adminApi
      .put(`${BASE}/hostels/000000000000000000000000/room-allocations`)
      .send([{ room: "A102", bedNumber: 1, rollNumber: "ADM002" }])
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Hostel not found not found")
  })

  it("forbids supervisors writing to a foreign hostel with 403", async () => {
    const res = await supervisorApi
      .put(`${BASE}/hostels/${hostelB._id}/room-allocations`)
      .send([{ room: "B201", bedNumber: 1, rollNumber: "ADM002" }])
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("You can only update allocations for your active hostel")
  })

  it("returns 400 when no row carries the required fields", async () => {
    const res = await adminApi
      .put(`${BASE}/hostels/${hostelA._id}/room-allocations`)
      .send([{ room: "A102" }]) // missing bedNumber + rollNumber
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("No valid allocation data provided")
  })

  it("allocates a student (update mode) and verifies through the lookup", async () => {
    const res = await adminApi
      .put(`${BASE}/hostels/${hostelA._id}/room-allocations`)
      .send([{ room: "A102", bedNumber: 1, rollNumber: "adm002" }])
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.mode).toBe("update")
    expect(res.body.data.allocations[0].rollNumber).toBe("ADM002")
    expect(res.body.data.errors).toEqual([])

    const lookup = await adminApi.get(`${BASE}/room-allocations/student/ADM002`)
    expect(lookup.body.data.student.currentAllocation.roomNumber).toBe("A102")
  })

  it("rejects two rows claiming the same bed in one upload", async () => {
    const res = await adminApi
      .put(`${BASE}/hostels/${hostelA._id}/room-allocations`)
      .send([
        { room: "A102", bedNumber: 2, rollNumber: "ADM005" },
        { room: "A102", bedNumber: 2, rollNumber: "10000001" },
      ])
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0].message).toContain("assigned to more than one student in this upload")
  })

  it("enforces room capacity", async () => {
    // Both beds of A102 are genuinely taken (ADM002@1, ADM005@2), so every
    // in-range bed targets an occupant whose delete frees a seat. Push the
    // denormalized occupancy counter past capacity to exercise the guard:
    // available = capacity - (occupancy - queuedDeletes) = 2 - (3 - 1) = 0.
    const { Room } = await import("../../../src/models/index.js")
    await Room.updateOne({ _id: roomA102._id }, { $set: { occupancy: 3 } })

    const res = await adminApi
      .put(`${BASE}/hostels/${hostelA._id}/room-allocations`)
      .send([{ room: "A102", bedNumber: 2, rollNumber: "10000001" }])
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0].message).toBe("Room is already at full capacity")

    // Restore the true count so later tests see consistent state.
    await Room.updateOne({ _id: roomA102._id }, { $set: { occupancy: 2 } })
  })

  it("refuses day scholars with a per-row error", async () => {
    // Make ADM005 a day scholar through the bulk tool first.
    await adminApi
      .put(`${BASE}/profiles/day-scholar`)
      .send({ data: { ADM005: { isDayScholar: true } } })

    const res = await adminApi
      .put(`${BASE}/hostels/${hostelA._id}/room-allocations`)
      .send([{ room: "A101", bedNumber: 2, rollNumber: "ADM005" }])
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0].message).toBe("Day scholars cannot be allocated a room")
  })

  it("replace mode clears every allocation in the hostel and applies the list", async () => {
    // Current hostelA occupancy: ADM001@A101-1, ADM002@A102-1 (ADM005 was
    // deallocated when the day-scholar test marked them as a day scholar).
    const res = await adminApi
      .put(`${BASE}/hostels/${hostelA._id}/room-allocations`)
      .send({
        mode: "replace",
        allocations: [{ room: "A101", bedNumber: 1, rollNumber: "ADM001" }],
      })
    expect(res.status).toBe(200)
    expect(res.body.data.mode).toBe("replace")
    expect(res.body.data.clearedCount).toBe(2)
    expect(res.body.message).toBe("Cleared 2 existing allocations and applied the new list")

    const gone = await adminApi.get(`${BASE}/room-allocations/student/ADM002`)
    expect(gone.body.data.student.currentAllocation).toBeNull()

    const kept = await adminApi.get(`${BASE}/room-allocations/student/ADM001`)
    expect(kept.body.data.student.currentAllocation.bedNumber).toBe(1)
  })

  it("lets supervisors allocate unallocated students into their own hostel", async () => {
    const res = await supervisorApi
      .put(`${BASE}/hostels/${hostelA._id}/room-allocations`)
      .send([{ room: "A102", bedNumber: 1, rollNumber: "ADM002" }])
    expect(res.status).toBe(200)
    expect(res.body.data.allocations[0].rollNumber).toBe("ADM002")
  })

  it("blocks supervisors from pulling students out of other hostels", async () => {
    const res = await supervisorApi
      .put(`${BASE}/hostels/${hostelA._id}/room-allocations`)
      .send([{ room: "A101", bedNumber: 2, rollNumber: "ADM003" }]) // housed in hostelB
    expect(res.status).toBe(207)
    expect(res.body.data.errors[0].message).toBe(
      "Student is allocated in another hostel and cannot be reassigned here"
    )
  })
})

// ---------------------------------------------------------------------------
// Taxonomy: option lists + renames
// ---------------------------------------------------------------------------

describe("taxonomy lists", () => {
  it("GET /taxonomy/options serves configured degrees/departments/groups to staff", async () => {
    for (const api of [adminApi, supervisorApi, wardenApi]) {
      const res = await api.get(`${BASE}/taxonomy/options`)
      expect(res.status).toBe(200)
      expect(res.body.data.degrees).toContain("BTech")
      expect(res.body.data.departments).toContain("CSE")
      expect(res.body.data.studentGroups).toContain("Club-A")
    }
  })

  it("GET /taxonomy/options rejects students with 403", async () => {
    const res = await studentApi.get(`${BASE}/taxonomy/options`)
    expect(res.status).toBe(403)
  })

  it("GET /departments|degrees/list are readable by students too", async () => {
    const depts = await studentApi.get(`${BASE}/departments/list`)
    expect(depts.status).toBe(200)
    expect(depts.body.data.departments).toContain("CSE")

    const degrees = await studentApi.get(`${BASE}/degrees/list`)
    expect(degrees.status).toBe(200)
    expect(degrees.body.data.degrees).toContain("BTech")
  })

  it("GET /batches/list filters by degree/department scope", async () => {
    const res = await adminApi.get(`${BASE}/batches/list?degree=BTech&department=CSE`)
    expect(res.status).toBe(200)
    expect(res.body.data.batches.sort()).toEqual(["2023", "2024"])

    const other = await adminApi.get(`${BASE}/batches/list?degree=BA&department=CSE`)
    expect(other.body.data.batches).toEqual([])
  })
})

describe("taxonomy renames (Admin + route.admin.settings)", () => {
  it("rejects non-Admin callers with 403", async () => {
    const res = await wardenApi
      .put(`${BASE}/departments/rename`)
      .send({ oldName: "CSE", newName: "CS" })
    expect(res.status).toBe(403)
  })

  it("requires oldName and newName", async () => {
    const res = await adminApi.put(`${BASE}/departments/rename`).send({ oldName: "CSE" })
    expect(res.status).toBe(400)
    expect(res.body.message).toBe("Both oldName and newName are required")
  })

  it("renames a department across config AND student profiles", async () => {
    // Give one student the ME department so the profile rewrite is observable.
    const meUser = await seed.student()
    await createStudentProfile({
      userId: meUser._id,
      rollNumber: `ME${uniq()}`.toUpperCase(),
      department: "ME",
    })

    const res = await adminApi
      .put(`${BASE}/departments/rename`)
      .send({ oldName: "ME", newName: "Mechanical Eng" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Department renamed successfully")

    const list = await adminApi.get(`${BASE}/departments/list`)
    expect(list.body.data.departments).toContain("Mechanical Eng")
    expect(list.body.data.departments).not.toContain("ME")

    // The rename rewrote the profile too.
    const details = await adminApi.get(`${BASE}/profile/details/${meUser._id}`)
    expect(details.body.data.student.department).toBe("Mechanical Eng")
  })

  it("protects the reserved mixed-scope name", async () => {
    const res = await adminApi
      .put(`${BASE}/departments/rename`)
      .send({ oldName: "CSE", newName: "__MIXED__" })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("reserved")
  })

  it("renames a degree and a batch inside the batch config", async () => {
    const degreeRes = await adminApi
      .put(`${BASE}/degrees/rename`)
      .send({ oldName: "BTech", newName: "B.Tech" })
    expect(degreeRes.status).toBe(200)

    // Batch rename under the NEW degree key.
    const batchRes = await adminApi
      .put(`${BASE}/batches/rename`)
      .send({ degree: "B.Tech", department: "CSE", oldName: "2024", newName: "2025" })
    expect(batchRes.status).toBe(200)
    expect(batchRes.body.message).toBe("Batch renamed successfully")

    const batches = await adminApi.get(`${BASE}/batches/list?degree=B.Tech&department=CSE`)
    expect(batches.body.data.batches.sort()).toEqual(["2023", "2025"])

    // Put the degree name back for any later readers.
    await adminApi.put(`${BASE}/degrees/rename`).send({ oldName: "B.Tech", newName: "BTech" })
  })

  it("renames a group across config and memberships", async () => {
    const res = await adminApi
      .put(`${BASE}/groups/rename`)
      .send({ oldName: "Club-A", newName: "Club-Renamed" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Group renamed successfully")

    const options = await adminApi.get(`${BASE}/taxonomy/options`)
    expect(options.body.data.studentGroups).toContain("Club-Renamed")
    expect(options.body.data.studentGroups).not.toContain("Club-A")

    // The student who held Club-A now holds Club-Renamed.
    const details = await adminApi.get(`${BASE}/profile/details/${sA1.user._id}`)
    expect(details.body.data.student.groups).toContain("Club-Renamed")
  })
})
