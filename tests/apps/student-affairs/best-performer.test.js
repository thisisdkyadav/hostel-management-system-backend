import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { saSeed } from "../../helpers/seed/student-affairs.js"

const BASE = "/api/v1/student-affairs/overall-best-performer"

const hoursFromNow = (h) => new Date(Date.now() + h * 3_600_000)

const proof = (label) => ({ label, sourceType: "upload", url: `/uploads/${label}.pdf` })

const applicationPayload = () => ({
  personalAcademic: {
    programme: "B.Tech Computer Science",
    isPassingOutStudent: true,
    hasNoDisciplinaryAction: true,
    hasNoFrGrade: true,
    declarationAccepted: true,
  },
  coursework: {
    evaluationMode: "ug_cgpa",
    scoreValue: 8.5,
    proofs: [proof("transcript")],
  },
  projectThesis: {
    track: "btech_project",
    btpAwardLevel: "institute_best",
    projectGrade: "AA",
    btpAwardProofs: [proof("btp-certificate")],
  },
  responsibilityItems: [
    {
      title: "Club Head",
      scoreType: "club_head_or_placmgr_or_fluxus_head_or_senator",
      proofs: [proof("por-letter")],
    },
  ],
})

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("overall best performer", () => {
  let admin
  let superAdmin
  let academics
  let eligibleStudent // roll number included in the occurrence scope
  let otherEligibleStudent // also in scope (used for the rejection workflow)
  let outOfScopeStudent // roll number NOT in the occurrence scope
  let droppedStudent
  let adminApi
  let academicsApi
  let studentApi

  let occurrence

  beforeAll(async () => {
    admin = await seed.admin()
    superAdmin = await seed.superAdmin()
    academics = await saSeed.academics("HOD")
    const eligible = await saSeed.studentWithProfile({ rollNumber: "BP23001" })
    const otherEligible = await saSeed.studentWithProfile({ rollNumber: "BP23002" })
    const outOfScope = await saSeed.studentWithProfile({ rollNumber: "BP29999" })
    const dropped = await saSeed.studentWithProfile({
      rollNumber: "BP23003",
      status: "Dropped",
    })
    eligibleStudent = eligible
    otherEligibleStudent = otherEligible
    outOfScopeStudent = outOfScope
    droppedStudent = dropped

    adminApi = await as(admin)
    academicsApi = await as(academics)
    studentApi = await as(eligible.user)
  })

  // ---------- GET /occurrences/selector ----------
  it("GET /occurrences/selector rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.get(`${BASE}/occurrences/selector`)
    expect(res.status).toBe(401)
  })

  it("GET /occurrences/selector rejects students with 403", async () => {
    const res = await studentApi.get(`${BASE}/occurrences/selector`)
    expect(res.status).toBe(403)
  })

  it("GET /occurrences/selector returns an empty selector initially (admin)", async () => {
    const res = await adminApi.get(`${BASE}/occurrences/selector`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.activeOccurrenceId).toBeNull()
    expect(res.body.data.occurrences).toEqual([])
  })

  it("GET /occurrences/selector is accessible to Academics", async () => {
    const res = await academicsApi.get(`${BASE}/occurrences/selector`)
    expect(res.status).toBe(200)
  })

  // ---------- POST /occurrences ----------
  it("POST /occurrences rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.post(`${BASE}/occurrences`).send({})
    expect(res.status).toBe(401)
  })

  it("POST /occurrences rejects students with 403", async () => {
    const res = await studentApi.post(`${BASE}/occurrences`).send({})
    expect(res.status).toBe(403)
  })

  it("POST /occurrences returns a validation error when required fields are missing", async () => {
    const res = await adminApi.post(`${BASE}/occurrences`).send({ title: "Incomplete" })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
  })

  it("POST /occurrences rejects unknown roll numbers with 400", async () => {
    const res = await adminApi.post(`${BASE}/occurrences`).send({
      title: "Bad Scope",
      awardYear: 2026,
      applyStartAt: hoursFromNow(-1).toISOString(),
      applyEndAt: hoursFromNow(24).toISOString(),
      eligibleRollNumbers: ["GHOST001"],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("GHOST001")
  })

  it("POST /occurrences rejects an end date in the past with 400", async () => {
    const res = await adminApi.post(`${BASE}/occurrences`).send({
      title: "Past Window",
      awardYear: 2026,
      applyStartAt: hoursFromNow(-48).toISOString(),
      applyEndAt: hoursFromNow(-24).toISOString(),
      eligibleRollNumbers: ["BP23001"],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/future/i)
  })

  it("POST /occurrences rejects start >= end with 400", async () => {
    const res = await adminApi.post(`${BASE}/occurrences`).send({
      title: "Backwards Window",
      awardYear: 2026,
      applyStartAt: hoursFromNow(24).toISOString(),
      applyEndAt: hoursFromNow(1).toISOString(),
      eligibleRollNumbers: ["BP23001"],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/before the end date/i)
  })

  it("POST /occurrences activates an occurrence (Super Admin allowed)", async () => {
    const api = await as(superAdmin)
    const res = await api.post(`${BASE}/occurrences`).send({
      title: "OBP 2026",
      awardYear: 2026,
      description: "Annual award",
      applyStartAt: hoursFromNow(-1).toISOString(),
      applyEndAt: hoursFromNow(48).toISOString(),
      eligibleRollNumbers: ["bp23001", "BP23002"],
    })
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Overall Best Performer occurrence activated")

    const data = res.body.data.occurrence
    expect(data.title).toBe("OBP 2026")
    expect(data.awardYear).toBe(2026)
    expect(data.status).toBe("active")
    expect(data.applicationWindowStatus).toBe("open")
    expect(data.eligibleStudentCount).toBe(2)

    const selector = await adminApi.get(`${BASE}/occurrences/selector`)
    expect(selector.body.data.activeOccurrenceId).toBe(String(data.id))
    occurrence = data
  })

  // ---------- GET /occurrences/:id ----------
  it("GET /occurrences/:id returns 404 for an unknown id", async () => {
    const res = await adminApi.get(`${BASE}/occurrences/000000000000000000000000`)
    expect(res.status).toBe(404)
  })

  it("GET /occurrences/:id returns a validation error for a malformed id", async () => {
    const res = await adminApi.get(`${BASE}/occurrences/nope`)
    expect(res.status).toBe(422)
  })

  it("GET /occurrences/:id returns detail with leaderboard stats and eligible students", async () => {
    const res = await adminApi.get(`${BASE}/occurrences/${occurrence.id}`)
    expect(res.status).toBe(200)
    const data = res.body.data
    expect(data.occurrence.id).toBe(occurrence.id)
    expect(data.occurrence.applicationCount).toBe(0)
    expect(data.occurrence.eligibleRollNumbers.sort()).toEqual(["BP23001", "BP23002"])
    const eligibleEntry = data.occurrence.eligibleStudents.find((s) => s.rollNumber === "BP23001")
    expect(eligibleEntry.exists).toBe(true)
    expect(eligibleEntry.email.toLowerCase()).toBe(eligibleStudent.user.email)
    expect(Array.isArray(data.leaderboard)).toBe(true)
  })

  // ---------- GET /student/portal-state ----------
  it("GET /student/portal-state rejects non-students with 403", async () => {
    const res = await adminApi.get(`${BASE}/student/portal-state`)
    expect(res.status).toBe(403)
  })

  it("GET /student/portal-state returns 404 for a student without a profile", async () => {
    const api = await as(await seed.student())
    const res = await api.get(`${BASE}/student/portal-state`)
    expect(res.status).toBe(404)
    expect(res.body.message).toContain("profile")
  })

  it("GET /student/portal-state marks an eligible student as eligible while the window is open", async () => {
    const res = await studentApi.get(`${BASE}/student/portal-state`)
    expect(res.status).toBe(200)
    const data = res.body.data
    expect(data.canAccessPortal).toBe(true)
    expect(data.isEligible).toBe(true)
    expect(data.hasApplied).toBe(false)
    expect(data.canEdit).toBe(true)
    expect(data.student.rollNumber).toBe("BP23001")
    expect(data.occurrence.id).toBe(occurrence.id)
  })

  it("GET /student/portal-state reports ineligibility for out-of-scope students", async () => {
    const api = await as(outOfScopeStudent.user)
    const res = await api.get(`${BASE}/student/portal-state`)
    expect(res.status).toBe(200)
    expect(res.body.data.isEligible).toBe(false)
    expect(res.body.data.canAccessPortal).toBe(false)
  })

  it("GET /student/portal-state blocks students with a disallowed profile status", async () => {
    const api = await as(droppedStudent.user)
    const res = await api.get(`${BASE}/student/portal-state`)
    expect(res.status).toBe(200)
    expect(res.body.data.studentStatusAllowed).toBe(false)
    expect(res.body.data.canAccessPortal).toBe(false)
  })

  // ---------- POST /occurrences/:id/application ----------
  it("POST /occurrences/:id/application rejects non-students with 403", async () => {
    const res = await adminApi
      .post(`${BASE}/occurrences/${occurrence.id}/application`)
      .send(applicationPayload())
    expect(res.status).toBe(403)
  })

  it("POST /occurrences/:id/application returns 404 for an unknown occurrence", async () => {
    const res = await studentApi
      .post(`${BASE}/occurrences/000000000000000000000000/application`)
      .send(applicationPayload())
    expect(res.status).toBe(404)
  })

  it("POST /occurrences/:id/application rejects out-of-scope students with 403", async () => {
    const api = await as(outOfScopeStudent.user)
    const res = await api
      .post(`${BASE}/occurrences/${occurrence.id}/application`)
      .send(applicationPayload())
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/not eligible/i)
  })

  it("POST /occurrences/:id/application rejects incomplete declarations with a validation error", async () => {
    const payload = applicationPayload()
    delete payload.personalAcademic.declarationAccepted
    const res = await studentApi
      .post(`${BASE}/occurrences/${occurrence.id}/application`)
      .send(payload)
    expect(res.status).toBe(422)
  })

  it("POST /occurrences/:id/application submits and scores an application", async () => {
    const res = await studentApi
      .post(`${BASE}/occurrences/${occurrence.id}/application`)
      .send(applicationPayload())
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Application submitted successfully")

    const application = res.body.data.application
    expect(application.rollNumber).toBe("BP23001")
    expect(application.review.status).toBe("submitted")
    // coursework 8.5*1.5=12.75 | projectThesis 5+4=9 | responsibilities 4 -> 25.75
    expect(application.scoreBreakdown.total).toBe(25.75)
    expect(application.calculatedTotal).toBe(25.75)
    expect(application.finalScore).toBe(25.75)
  })

  it("POST /occurrences/:id/application updates an existing application (upsert)", async () => {
    const payload = applicationPayload()
    payload.coursework.scoreValue = 9
    const res = await studentApi
      .post(`${BASE}/occurrences/${occurrence.id}/application`)
      .send(payload)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Application updated successfully")
    // coursework 9*1.5=13.5 | projectThesis 9 | responsibilities 4 -> 26.5
    expect(res.body.data.application.scoreBreakdown.total).toBe(26.5)
  })

  it("POST /occurrences/:id/application accepts a second in-scope applicant", async () => {
    const api = await as(otherEligibleStudent.user)
    const res = await api
      .post(`${BASE}/occurrences/${occurrence.id}/application`)
      .send(applicationPayload())
    expect(res.status).toBe(200)
    expect(res.body.data.application.rollNumber).toBe("BP23002")
  })

  // ---------- review / admin edits BEFORE the deadline ----------
  it("POST /applications/:id/review refuses review before the deadline with 400", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await adminApi
      .post(`${BASE}/applications/${applicationId}/review`)
      .send({ decision: "approved" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/after the deadline/i)
  })

  it("POST /applications/:id/hod-verification refuses verification before the deadline with 400", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await academicsApi
      .post(`${BASE}/applications/${applicationId}/hod-verification`)
      .send({ action: "verified", remarks: "Looks good" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/after the deadline/i)
  })

  // ---------- PUT /occurrences/:id ----------
  it("PUT /occurrences/:id rejects students with 403", async () => {
    const res = await studentApi.put(`${BASE}/occurrences/${occurrence.id}`).send({
      title: "Hacked",
    })
    expect(res.status).toBe(403)
  })

  it("PUT /occurrences/:id returns 404 for an unknown id", async () => {
    const res = await adminApi
      .put(`${BASE}/occurrences/000000000000000000000000`)
      .send({ title: "Ghost" })
    expect(res.status).toBe(404)
  })

  it("PUT /occurrences/:id rejects an invalid window with 400", async () => {
    const res = await adminApi.put(`${BASE}/occurrences/${occurrence.id}`).send({
      applyStartAt: hoursFromNow(10).toISOString(),
      applyEndAt: hoursFromNow(5).toISOString(),
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/before the end date/i)
  })

  it("PUT /occurrences/:id closes the occurrence when the window moves into the past", async () => {
    const res = await adminApi.put(`${BASE}/occurrences/${occurrence.id}`).send({
      applyEndAt: hoursFromNow(-1).toISOString(),
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Occurrence updated successfully")
    expect(res.body.data.occurrence.status).toBe("closed")
    expect(res.body.data.occurrence.applicationWindowStatus).toBe("closed")
  })

  // ---------- POST /applications/:id/review (after deadline) ----------
  it("POST /applications/:id/review rejects students with 403", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await studentApi
      .post(`${BASE}/applications/${applicationId}/review`)
      .send({ decision: "approved" })
    expect(res.status).toBe(403)
  })

  it("POST /applications/:id/review returns 404 for an unknown application", async () => {
    const res = await adminApi
      .post(`${BASE}/applications/000000000000000000000000/review`)
      .send({ decision: "approved" })
    expect(res.status).toBe(404)
  })

  it("POST /applications/:id/review approves the application after the deadline", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await adminApi
      .post(`${BASE}/applications/${applicationId}/review`)
      .send({ decision: "approved", remarks: "Strong profile" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Application approved")
    const application = res.body.data.application
    expect(application.review.status).toBe("approved")
    expect(application.finalScore).toBe(application.calculatedTotal)
  })

  // The leaderboard is score-sorted, so always resolve the main applicant's
  // application by roll number rather than by position.
  const getApplicationIdByRoll = async (rollNumber) => {
    const detail = await adminApi.get(`${BASE}/occurrences/${occurrence.id}`)
    const entry = detail.body.data.leaderboard.find(
      (item) => item.rollNumber === rollNumber
    )
    expect(entry).toBeTruthy()
    return entry.id
  }

  it("PATCH /applications/:id/coursework-score rejects out-of-range values with a validation error", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await adminApi
      .patch(`${BASE}/applications/${applicationId}/coursework-score`)
      .send({ scoreValue: 5.5 })
    expect(res.status).toBe(422)
  })

  it("PATCH /applications/:id/coursework-score updates the CGPA and recomputes the total", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await adminApi
      .patch(`${BASE}/applications/${applicationId}/coursework-score`)
      .send({ scoreValue: 9 })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("CGPA / CPI updated")
    // coursework 9*1.5=13.5 | projectThesis 9 | responsibilities 4 -> 26.5
    expect(res.body.data.application.scoreBreakdown.coursework).toBe(13.5)
    expect(res.body.data.application.scoreBreakdown.total).toBe(26.5)
    expect(res.body.data.application.review.finalScore).toBe(26.5)
  })

  it("PATCH /applications/:id/item-type rejects an invalid section with a validation error", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await adminApi
      .patch(`${BASE}/applications/${applicationId}/item-type`)
      .send({ sectionKey: "bogusItems", itemIndex: 0, scoreType: "team_member" })
    expect(res.status).toBe(422)
  })

  it("PATCH /applications/:id/item-type rejects a scoreType outside the section map with 400", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await adminApi
      .patch(`${BASE}/applications/${applicationId}/item-type`)
      .send({
        sectionKey: "responsibilityItems",
        itemIndex: 0,
        scoreType: "not_a_real_type",
      })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Invalid type selected/)
  })

  it("PATCH /applications/:id/item-type reclassifies an item and recomputes the score", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await adminApi
      .patch(`${BASE}/applications/${applicationId}/item-type`)
      .send({
        sectionKey: "responsibilityItems",
        itemIndex: 0,
        scoreType: "team_member",
      })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Application item type updated")
    // responsibilities drop 4 -> 2 => total 24.5
    expect(res.body.data.application.responsibilityItems[0].calculatedPoints).toBe(2)
    expect(res.body.data.application.scoreBreakdown.total).toBe(24.5)
  })

  it("PATCH /applications/:id/project-thesis-grades updates BTP grades and recomputes", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await adminApi
      .patch(`${BASE}/applications/${applicationId}/project-thesis-grades`)
      .send({ btpAwardLevel: "second", projectGrade: "AP" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("BTP grades updated")
    // projectThesis 4+5=9 stays 9; total unchanged at 24.5
    expect(res.body.data.application.projectThesis.btpAwardLevel).toBe("second")
    expect(res.body.data.application.scoreBreakdown.total).toBe(24.5)
  })

  it("POST /applications/:id/hod-verification rejects admins with 403 (Academics only)", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await adminApi
      .post(`${BASE}/applications/${applicationId}/hod-verification`)
      .send({ action: "verified", remarks: "Nope" })
    expect(res.status).toBe(403)
  })

  it("POST /applications/:id/hod-verification requires remarks with a validation error", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await academicsApi
      .post(`${BASE}/applications/${applicationId}/hod-verification`)
      .send({ action: "verified", remarks: "" })
    expect(res.status).toBe(422)
  })

  it("POST /applications/:id/hod-verification appends a verification entry (Academics)", async () => {
    const applicationId = await getApplicationIdByRoll("BP23001")
    const res = await academicsApi
      .post(`${BASE}/applications/${applicationId}/hod-verification`)
      .send({ action: "verified", remarks: "Verified by HOD" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Application verified")
    const verifications = res.body.data.application.hodVerifications
    expect(verifications.length).toBe(1)
    expect(verifications[0].action).toBe("verified")
    expect(verifications[0].remarks).toBe("Verified by HOD")
    expect(verifications[0].verifierEmail.toLowerCase()).toBe(academics.email)
  })

  it("POST /applications/:id/review can reject an application", async () => {
    const detail = await adminApi.get(`${BASE}/occurrences/${occurrence.id}`)
    const target = detail.body.data.leaderboard.find(
      (item) => item.rollNumber === "BP23002"
    )
    expect(target).toBeTruthy()
    const res = await adminApi
      .post(`${BASE}/applications/${target.id}/review`)
      .send({ decision: "rejected", remarks: "Insufficient proofs" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Application rejected")
    expect(res.body.data.application.review.status).toBe("rejected")
    expect(res.body.data.application.finalScore).toBe(0)
  })

  it("POST /occurrences/:id/application refuses edits once the window is closed (400)", async () => {
    // NOTE: the window check runs before the reviewed-application check, so a
    // closed window masks the "reviewed applications can no longer be edited"
    // branch at the API level.
    const api = await as(otherEligibleStudent.user)
    const res = await api
      .post(`${BASE}/occurrences/${occurrence.id}/application`)
      .send(applicationPayload())
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/between the configured start and end date/i)
  })

  // ---------- creating a new occurrence closes the active one ----------
  it("POST /occurrences closes the previously active occurrence", async () => {
    const res = await adminApi.post(`${BASE}/occurrences`).send({
      title: "OBP 2027",
      awardYear: 2027,
      applyStartAt: hoursFromNow(-1).toISOString(),
      applyEndAt: hoursFromNow(24).toISOString(),
      eligibleRollNumbers: ["BP23001"],
    })
    expect(res.status).toBe(201)
    const newOccurrence = res.body.data.occurrence

    const selector = await adminApi.get(`${BASE}/occurrences/selector`)
    expect(selector.body.data.activeOccurrenceId).toBe(String(newOccurrence.id))
    const previous = selector.body.data.occurrences.find(
      (o) => String(o.id) === String(occurrence.id)
    )
    expect(previous.status).toBe("closed")

    // Portal state now reflects the new active occurrence.
    const portal = await studentApi.get(`${BASE}/student/portal-state`)
    expect(portal.body.data.occurrence.id).toBe(newOccurrence.id)
    expect(portal.body.data.hasApplied).toBe(false)
  })
})
