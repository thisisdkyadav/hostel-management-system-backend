import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  createStudentProfile,
  createHostel,
  createRoom,
  createAllocation,
  createHealthRecord,
} from "../../helpers/seed/students.js"

const BASE = "/api/v1/students/profiles-self"

async function createComplaint(userId, title, status) {
  const { Complaint } = await import("../../../src/models/index.js")
  return Complaint.create({
    userId,
    title,
    description: "Integration-test complaint",
    status,
    ...(status === "Resolved"
      ? { resolutionDate: new Date(), resolutionNotes: "Fixed" }
      : {}),
  })
}

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("profiles-self auth wall", () => {
  it("rejects unauthenticated requests with 401 on all routes", async () => {
    const api = await anon()
    expect((await api.get(`${BASE}/dashboard`)).status).toBe(401)
    expect((await api.get(`${BASE}/profile`)).status).toBe(401)
    expect((await api.get(`${BASE}/000000000000000000000000/id-card`)).status).toBe(401)
    expect((await api.post(`${BASE}/000000000000000000000000/id-card`)).status).toBe(401)
  })

  it("rejects wardens with 403 on student-only routes", async () => {
    const warden = await seed.warden()
    const api = await as(warden)
    expect((await api.get(`${BASE}/dashboard`)).status).toBe(403)
    expect((await api.get(`${BASE}/profile`)).status).toBe(403)
  })

  it("rejects roles outside the id-card guard with 403 (security)", async () => {
    const security = await seed.security()
    const api = await as(security)
    const res = await api.get(`${BASE}/000000000000000000000000/id-card`)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })
})

describe("GET /dashboard", () => {
  it("returns 404 when the caller has no student profile", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.get(`${BASE}/dashboard`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Student profile not found not found")
  })

  it("aggregates profile, room, roommates, complaints, insurance and events", async () => {
    const student = await seed.student({ name: "Dash Student" })
    const roommateUser = await seed.student({ name: "Roomie Student" })
    const profile = await createStudentProfile({
      userId: student._id,
      rollNumber: "DSH001",
      degree: "B.Tech",
      batch: "2023",
      dateOfBirth: "2003-08-09",
    })
    const roommateProfile = await createStudentProfile({
      userId: roommateUser._id,
      rollNumber: "DSH002",
    })

    const hostel = await createHostel({ name: "Dashboard Bhavan" })
    const room = await createRoom({ hostelId: hostel._id, roomNumber: "D101", capacity: 2 })
    const allocation = await createAllocation({
      userId: student._id,
      studentProfileId: profile._id,
      hostelId: hostel._id,
      roomId: room._id,
      bedNumber: 1,
    })
    await createAllocation({
      userId: roommateUser._id,
      studentProfileId: roommateProfile._id,
      hostelId: hostel._id,
      roomId: room._id,
      bedNumber: 2,
    })

    await createComplaint(student._id, "Leaky tap", "Pending")
    await createComplaint(student._id, "Broken fan", "Resolved")

    await createHealthRecord({
      userId: student._id,
      bloodGroup: "A+",
      insuranceNumber: "INS-DASH-1",
    })

    const { Event } = await import("../../../src/models/index.js")
    await Event.create({
      eventName: "Dash Fest",
      description: "A festival for the dashboard test",
      dateAndTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      hostelId: hostel._id,
    })
    const { default: LostAndFound } = await import("../../../src/models/lost-found/LostAndFound.model.js")
    await LostAndFound.create({
      itemName: "Dash Wallet",
      description: "Black wallet found near mess",
      status: "Active",
    })

    // Events/lost-and-found are served through shared Redis caches that may
    // hold payloads from earlier runs; rebuild them so the dashboard sees the
    // documents seeded above.
    const { refreshCommonCache } = await import("../../../src/services/cache/commonData.cache.js")
    await refreshCommonCache("events", { useLock: false })
    await refreshCommonCache("lostAndFound", { useLock: false })

    const api = await as(student)
    const res = await api.get(`${BASE}/dashboard`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.profile.name).toBe("Dash Student")
    expect(data.profile.rollNumber).toBe("DSH001")
    expect(data.profile.hostelName).toBe("Dashboard Bhavan")

    // Room info: shared room -> "room(bed)" display, both beds mapped.
    expect(data.roomInfo.roomNumber).toBe("D101(1)")
    expect(data.roomInfo.hostelName).toBe("Dashboard Bhavan")
    expect(data.roomInfo.totalBeds).toBe(2)
    expect(data.roomInfo.occupiedBeds).toBe(2)
    expect(data.roomInfo.beds).toHaveLength(2)
    expect(data.roomInfo.beds.find((b) => b.bedNumber === "1").isCurrentUser).toBe(true)
    expect(data.roomInfo.beds.find((b) => b.bedNumber === "2").isCurrentUser).toBe(false)
    expect(data.roomInfo.roommates.map((r) => r.rollNumber)).toEqual(["DSH002"])
    expect(data.roomInfo.roommates[0].name).toBe("Roomie Student")

    expect(data.stats.complaints).toEqual({ pending: 1, inProgress: 0, resolved: 1, total: 2 })
    expect(data.activeComplaints.map((c) => c.title)).toEqual(["Leaky tap"])
    expect(data.resolvedComplaintsWithoutFeedback.map((c) => c.title)).toEqual(["Broken fan"])

    expect(data.insurance.insuranceNumber).toBe("INS-DASH-1")

    // Events are served through a shared Redis cache built from the DB; assert
    // our event shows up rather than exact totals (other seeds may exist).
    expect(data.upcomingEvents.some((e) => e.eventName === "Dash Fest")).toBe(true)
    expect(data.stats.events.upcoming).toBeGreaterThanOrEqual(1)
    expect(data.stats.lostAndFound.total).toBeGreaterThanOrEqual(1)

    // Second read is served from the per-user dashboard cache.
    const cached = await api.get(`${BASE}/dashboard`)
    expect(cached.status).toBe(200)
    expect(cached.body.data.profile.name).toBe("Dash Student")
    expect(cached.body.data.roomInfo.roomNumber).toBe("D101(1)")
  })
})

describe("GET /profile", () => {
  it("returns 404 when no student profile exists", async () => {
    const student = await seed.student()
    const api = await as(student)
    const res = await api.get(`${BASE}/profile`)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Student profile not found not found")
  })

  it("returns the full populated profile", async () => {
    const student = await seed.student({ name: "Self Profile" })
    await createStudentProfile({
      userId: student._id,
      rollNumber: "SLF001",
      department: "ECE",
    })
    const api = await as(student)
    const res = await api.get(`${BASE}/profile`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.name).toBe("Self Profile")
    expect(res.body.data.rollNumber).toBe("SLF001")
    expect(res.body.data.department).toBe("ECE")
    expect(res.body.data.email).toBe(student.email)
  })
})

describe("GET /:userId/id-card", () => {
  let student
  let otherStudent
  let admin

  beforeAll(async () => {
    student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "IDC001" })
    otherStudent = await seed.student()
    await createStudentProfile({ userId: otherStudent._id, rollNumber: "IDC002" })
    admin = await seed.admin()
  })

  it("returns the raw id-card object (no success envelope) for the owner", async () => {
    // NOTE: this controller bypasses the standard { success, data } envelope
    // and responds with the bare idCard value.
    const api = await as(student)
    const res = await api.get(`${BASE}/${student._id}/id-card`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ front: "", back: "" })
  })

  it("forbids a student reading another student's card with 403", async () => {
    // NOTE: the error path also skips the envelope — only { message } is sent.
    const api = await as(otherStudent)
    const res = await api.get(`${BASE}/${student._id}/id-card`)
    expect(res.status).toBe(403)
    expect(res.body.message).toBe("Unauthorized")
    expect(res.body.success).toBeUndefined()
  })

  it("lets staff (admin, warden) read a student's card", async () => {
    const adminApi = await as(admin)
    const res = await adminApi.get(`${BASE}/${student._id}/id-card`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ front: "", back: "" })

    const wardenApi = await as(await seed.warden())
    const wardenRes = await wardenApi.get(`${BASE}/${student._id}/id-card`)
    expect(wardenRes.status).toBe(200)
  })

  it("returns 404 for an unknown user id", async () => {
    const api = await as(admin)
    const res = await api.get(`${BASE}/000000000000000000000000/id-card`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Student profile not found not found")
  })
})

describe("POST /:userId/id-card", () => {
  let student
  let otherStudent

  beforeAll(async () => {
    student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "IDP001" })
    otherStudent = await seed.student()
    await createStudentProfile({ userId: otherStudent._id, rollNumber: "IDP002" })
  })

  it("uploads the owner's id card and persists it", async () => {
    const api = await as(student)
    const res = await api.post(`${BASE}/${student._id}/id-card`).send({
      front: "https://storage.example/front.jpg",
      back: "https://storage.example/back.jpg",
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Student ID card uploaded successfully")

    const followUp = await as(student)
    const card = await followUp.get(`${BASE}/${student._id}/id-card`)
    expect(card.status).toBe(200)
    expect(card.body.front).toBe("https://storage.example/front.jpg")
    expect(card.body.back).toBe("https://storage.example/back.jpg")
  })

  it("rejects non-students with 403", async () => {
    const api = await as(await seed.admin())
    const res = await api.post(`${BASE}/${student._id}/id-card`).send({ front: "x", back: "y" })
    expect(res.status).toBe(403)
  })

  it("SUSPECTED BUG: the :userId path param is ignored — it always writes the caller's own card", async () => {
    // SUSPECTED BUG: uploadStudentIdCard never reads req.params.userId; the
    // service writes idCard for currentUser._id. A student can therefore POST
    // to ANY /:userId/id-card (including another student's id) and the update
    // silently lands on their own profile instead of 403/404.
    const api = await as(otherStudent)
    const res = await api.post(`${BASE}/${student._id}/id-card`).send({
      front: "https://storage.example/mine-front.jpg",
      back: "https://storage.example/mine-back.jpg",
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Student ID card uploaded successfully")

    // The OTHER student's card was NOT touched...
    const adminApi = await as(await seed.admin())
    const victimCard = await adminApi.get(`${BASE}/${student._id}/id-card`)
    expect(victimCard.body.front).toBe("https://storage.example/front.jpg")

    // ...the CALLER's card was.
    const callerCard = await api.get(`${BASE}/${otherStudent._id}/id-card`)
    expect(callerCard.body.front).toBe("https://storage.example/mine-front.jpg")
  })
})
