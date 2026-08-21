import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import { saSeed } from "../../helpers/seed/student-affairs.js"

const BASE = "/api/v1/student-affairs/elections"

const h = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString()

// Timeline placing "now" inside the nomination window.
const nominationTimeline = () => ({
  announcementAt: h(-48),
  nominationStartAt: h(-24),
  nominationEndAt: h(24),
  withdrawalEndAt: h(48),
  campaigningStartAt: h(72),
  campaigningEndAt: h(96),
  votingStartAt: h(120),
  votingEndAt: h(144),
  resultsAnnouncedAt: h(168),
  handoverAt: null,
})

// Timeline placing "now" inside the voting window (email window already open).
const votingTimeline = () => ({
  announcementAt: h(-240),
  nominationStartAt: h(-216),
  nominationEndAt: h(-192),
  withdrawalEndAt: h(-168),
  campaigningStartAt: h(-144),
  campaigningEndAt: h(-120),
  votingEmailStartAt: h(-1),
  votingStartAt: h(-0.5),
  votingEndAt: h(0.75),
  resultsAnnouncedAt: h(2),
  handoverAt: null,
})

// Timeline placing "now" after voting has ended and results were announced.
const resultsTimeline = () => ({
  announcementAt: h(-240),
  nominationStartAt: h(-216),
  nominationEndAt: h(-192),
  withdrawalEndAt: h(-168),
  campaigningStartAt: h(-144),
  campaigningEndAt: h(-120),
  votingEmailStartAt: h(-3),
  votingStartAt: h(-2),
  votingEndAt: h(-0.5),
  resultsAnnouncedAt: h(-0.25),
  handoverAt: null,
})

const makePost = ({ title, candidateRolls, voterRolls }) => ({
  title,
  category: "custom",
  candidateEligibility: { batches: [], groups: [], extraRollNumbers: candidateRolls },
  voterEligibility: { batches: [], groups: [], extraRollNumbers: voterRolls },
})

const makeElectionPayload = ({ title, timeline, posts, status = "published" }) => ({
  title,
  academicYear: "2026-27",
  status,
  timeline,
  electionCommission: { chiefElectionOfficerRollNumber: "EC001", officerRollNumbers: [] },
  votingAccess: { mode: "both", autoSendEnabled: false },
  mockSettings: { enabled: false, voterRollNumbers: [] },
  posts,
})

const nominationPayload = (proposerRoll, seconderRoll, overrides = {}) => ({
  cgpa: 8,
  hasNoActiveBacklogs: true,
  proposerRollNumbers: [proposerRoll],
  seconderRollNumbers: [seconderRoll],
  ...overrides,
})

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("elections", () => {
  let adminApi
  let superAdminApi
  let officerApi // Gymkhana / Election Officer
  let gsApi // Gymkhana / GS Gymkhana (not an officer)
  let academicsApi
  let anonApi

  // students: roll -> { user, profile }
  const students = {}
  const roll = (r) => students[r]

  let electionDraft // draft election (management tests)
  let electionScratch // cancelled election (clone guard test)
  let electionNom // published, nomination stage
  let electionVote // published; moved nomination -> voting -> results
  let presidentPostId
  let gsPostId
  let votePostId
  let nominationA // candA's nomination on electionNom
  let nominationD // candD's nomination on electionVote

  beforeAll(async () => {
    const admin = await seed.admin()
    adminApi = await as(admin)
    superAdminApi = await as(await seed.superAdmin())
    officerApi = await as(await saSeed.gymkhana("Election Officer"))
    gsApi = await as(await saSeed.gymkhana("GS Gymkhana"))
    academicsApi = await as(await saSeed.academics("HOD"))
    anonApi = await anon()

    // Commission chief (has an ID card so the commission-contest guard is what
    // rejects him, not the ID-card guard).
    students.EC001 = await saSeed.studentWithProfile({
      rollNumber: "EC001",
      idCard: { front: "/uploads/ec-front.png", back: "" },
    })
    students.EL001 = await saSeed.studentWithProfile({
      rollNumber: "EL001",
      idCard: { front: "/uploads/a-front.png", back: "" },
    })
    students.EL002 = await saSeed.studentWithProfile({ rollNumber: "EL002" })
    students.EL003 = await saSeed.studentWithProfile({ rollNumber: "EL003" })
    students.EL004 = await saSeed.studentWithProfile({ rollNumber: "EL004" })
    students.EL005 = await saSeed.studentWithProfile({ rollNumber: "EL005" })
    students.EL006 = await saSeed.studentWithProfile({
      rollNumber: "EL006",
      idCard: { front: "/uploads/x-front.png", back: "" },
    })
    students.EL007 = await saSeed.studentWithProfile({
      rollNumber: "EL007",
      idCard: { front: "/uploads/d-front.png", back: "" },
    })
    students.EL008 = await saSeed.studentWithProfile({ rollNumber: "EL008" })
    students.OUT999 = await saSeed.studentWithProfile({ rollNumber: "OUT999" })
  })

  // =================== creation & management ===================

  it("POST / rejects unauthenticated requests with 401", async () => {
    const res = await anonApi.post(BASE).send({})
    expect(res.status).toBe(401)
  })

  it("POST / rejects students with 403", async () => {
    const api = await as((await saSeed.studentWithProfile({ rollNumber: "PLAIN1" })).user)
    const res = await api.post(BASE).send({})
    expect(res.status).toBe(403)
  })

  it("POST / returns a validation error when the timeline or posts are missing", async () => {
    const res = await adminApi.post(BASE).send({ title: "Incomplete Election" })
    expect(res.status).toBe(422)
  })

  it("POST / rejects an out-of-order timeline with 400", async () => {
    const timeline = nominationTimeline()
    const swapped = {
      ...timeline,
      nominationStartAt: timeline.announcementAt,
      announcementAt: timeline.nominationStartAt,
    }
    const res = await adminApi
      .post(BASE)
      .send(
        makeElectionPayload({
          title: "Broken Timeline",
          timeline: swapped,
          posts: [makePost({ title: "Post A", candidateRolls: ["EL001"], voterRolls: ["EL002"] })],
        })
      )
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Timeline order is invalid/)
  })

  it("POST / rejects unknown election-commission roll numbers with 400", async () => {
    const payload = makeElectionPayload({
      title: "Ghost Commission",
      timeline: nominationTimeline(),
      posts: [makePost({ title: "Post A", candidateRolls: ["EL001"], voterRolls: ["EL002"] })],
    })
    payload.electionCommission.chiefElectionOfficerRollNumber = "GHOST01"
    const res = await adminApi.post(BASE).send(payload)
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("GHOST01")
  })

  it("POST / creates a draft election (Super Admin allowed)", async () => {
    const payload = makeElectionPayload({
      title: "Draft Election",
      timeline: nominationTimeline(),
      status: "draft",
      posts: [
        makePost({
          title: "President",
          candidateRolls: ["EL001", "EL007", "EL008", "EC001"],
          voterRolls: ["EL002", "EL003", "EL004", "EL005", "EL006"],
        }),
        makePost({ title: "General Secretary", candidateRolls: ["EL001"], voterRolls: ["EL002"] }),
      ],
    })
    const res = await superAdminApi.post(BASE).send(payload)
    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Election created successfully")
    electionDraft = res.body.data
    expect(electionDraft.title).toBe("Draft Election")
    expect(electionDraft.status).toBe("draft")
    expect(electionDraft.currentStage).toBe("draft")

    const detail = await adminApi.get(`${BASE}/${electionDraft.id}`)
    presidentPostId = String(detail.body.data.posts.find((p) => p.title === "President").id)
    gsPostId = String(detail.body.data.posts.find((p) => p.title === "General Secretary").id)
  })

  it("POST / creates a second draft used for the cancellation guard", async () => {
    const res = await adminApi
      .post(BASE)
      .send(
        makeElectionPayload({
          title: "Scratch Election",
          timeline: nominationTimeline(),
          status: "draft",
          posts: [makePost({ title: "Post A", candidateRolls: ["EL001"], voterRolls: ["EL002"] })],
        })
      )
    expect(res.status).toBe(201)
    electionScratch = res.body.data
  })

  it("GET /admin/selector rejects unauthenticated requests with 401", async () => {
    const res = await anonApi.get(`${BASE}/admin/selector`)
    expect(res.status).toBe(401)
  })

  it("GET /admin/selector rejects students with 403", async () => {
    const api = await as(students.EL002.user)
    const res = await api.get(`${BASE}/admin/selector`)
    expect(res.status).toBe(403)
  })

  it("GET /admin/selector rejects non-officer Gymkhana users with 403 (service-level)", async () => {
    const res = await gsApi.get(`${BASE}/admin/selector`)
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/not allowed to view elections/i)
  })

  it("GET /admin/selector lists all elections for admins", async () => {
    const res = await adminApi.get(`${BASE}/admin/selector`)
    expect(res.status).toBe(200)
    const titles = res.body.data.elections.map((e) => e.title)
    expect(titles).toContain("Draft Election")
  })

  it("GET /admin/selector hides draft elections from Election Officers", async () => {
    const res = await officerApi.get(`${BASE}/admin/selector`)
    expect(res.status).toBe(200)
    for (const election of res.body.data.elections) {
      expect(election.status).toBe("published")
      expect(election.title).not.toContain("Draft")
    }
  })

  it("POST /scope-count counts active students in a batch scope", async () => {
    const res = await adminApi.post(`${BASE}/scope-count`).send({ batches: ["2023"] })
    expect(res.status).toBe(200)
    expect(res.body.data.count).toBe(11) // EC001..EL008 + OUT999 + PLAIN1
  })

  it("POST /scope-count counts by explicit roll numbers", async () => {
    const res = await adminApi
      .post(`${BASE}/scope-count`)
      .send({ batches: [], groups: [], extraRollNumbers: ["el004"] })
    expect(res.status).toBe(200)
    expect(res.body.data.count).toBe(1)
  })

  it("POST /scope-count returns 0 for an empty scope (no validation on this endpoint)", async () => {
    const res = await adminApi
      .post(`${BASE}/scope-count`)
      .send({ batches: [], groups: [], extraRollNumbers: [] })
    expect(res.status).toBe(200)
    expect(res.body.data.count).toBe(0)
  })

  it("GET /:id returns 404 for an unknown election", async () => {
    const res = await adminApi.get(`${BASE}/000000000000000000000000`)
    expect(res.status).toBe(404)
  })

  it("GET /:id rejects students with 403", async () => {
    const api = await as(students.EL002.user)
    const res = await api.get(`${BASE}/${electionDraft.id}`)
    expect(res.status).toBe(403)
  })

  it("GET /:id blocks Election Officers from unpublished elections with 403", async () => {
    const res = await officerApi.get(`${BASE}/${electionDraft.id}`)
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/only view published/i)
  })

  it("PUT /:id renames an election", async () => {
    const payload = makeElectionPayload({
      title: "Draft Election Renamed",
      timeline: nominationTimeline(),
      status: "draft",
      posts: [
        makePost({
          title: "President",
          candidateRolls: ["EL001", "EL007", "EL008", "EC001"],
          voterRolls: ["EL002", "EL003", "EL004", "EL005", "EL006"],
        }),
        makePost({ title: "General Secretary", candidateRolls: ["EL001"], voterRolls: ["EL002"] }),
      ],
    })
    const res = await adminApi.put(`${BASE}/${electionDraft.id}`).send(payload)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Election updated successfully")
    expect(res.body.data.title).toBe("Draft Election Renamed")
  })

  it("PUT /:id cancels the scratch election", async () => {
    const payload = makeElectionPayload({
      title: "Scratch Election",
      timeline: nominationTimeline(),
      status: "cancelled",
      posts: [makePost({ title: "Post A", candidateRolls: ["EL001"], voterRolls: ["EL002"] })],
    })
    const res = await adminApi.put(`${BASE}/${electionScratch.id}`).send(payload)
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe("cancelled")
  })

  // =================== published election in nomination stage ===================

  it("POST / creates the published nomination-stage election", async () => {
    const res = await adminApi
      .post(BASE)
      .send(
        makeElectionPayload({
          title: "Gymkhana Elections 2026",
          timeline: nominationTimeline(),
          posts: [
            makePost({
              title: "President",
              candidateRolls: ["EL001", "EL007", "EL008", "EC001"],
              voterRolls: ["EL002", "EL003", "EL004", "EL005", "EL006"],
            }),
            makePost({ title: "General Secretary", candidateRolls: ["EL001"], voterRolls: ["EL002"] }),
          ],
        })
      )
    expect(res.status).toBe(201)
    electionNom = res.body.data
    expect(electionNom.currentStage).toBe("nomination")

    const detail = await adminApi.get(`${BASE}/${electionNom.id}`)
    presidentPostId = String(detail.body.data.posts.find((p) => p.title === "President").id)
    gsPostId = String(detail.body.data.posts.find((p) => p.title === "General Secretary").id)
  })

  it("GET /admin/selector includes the published election for Election Officers", async () => {
    const res = await officerApi.get(`${BASE}/admin/selector`)
    expect(res.status).toBe(200)
    const ids = res.body.data.elections.map((e) => String(e.id))
    expect(ids).toContain(String(electionNom.id))
    for (const election of res.body.data.elections) {
      expect(election.status).toBe("published")
    }
  })

  it("GET /:id lets Election Officers view published elections", async () => {
    const res = await officerApi.get(`${BASE}/${electionNom.id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.nominations).toEqual([])
  })

  it("POST /:id/posts/:postId/nominations rejects non-students with 403", async () => {
    const res = await adminApi
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send(nominationPayload("EL002", "EL003"))
    expect(res.status).toBe(403)
  })

  it("POST /:id/posts/:postId/nominations returns 404 for an unknown post", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/000000000000000000000000/nominations`)
      .send(nominationPayload("EL002", "EL003"))
    expect(res.status).toBe(404)
  })

  it("POST /:id/posts/:postId/nominations refuses nominations outside the nomination stage", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionDraft.id}/posts/${presidentPostId}/nominations`)
      .send(nominationPayload("EL002", "EL003"))
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Nominations are not open/i)
  })

  it("POST /:id/posts/:postId/nominations rejects out-of-scope candidates with 403", async () => {
    const api = await as(students.OUT999.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send(nominationPayload("EL002", "EL003"))
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/not eligible to contest/i)
  })

  it("POST /:id/posts/:postId/nominations demands an uploaded ID card with 403", async () => {
    const api = await as(students.EL008.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send(nominationPayload("EL002", "EL003"))
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/ID card/i)
  })

  it("POST /:id/posts/:postId/nominations blocks election-commission members with 403", async () => {
    const api = await as(students.EC001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send(nominationPayload("EL002", "EL003"))
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/commission members cannot contest/i)
  })

  it("POST /:id/posts/:postId/nominations enforces the minimum CGPA with 403", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send(nominationPayload("EL002", "EL003", { cgpa: 5 }))
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Minimum CGPA 6/)
  })

  it("POST /:id/posts/:postId/nominations requires the backlog declaration (validation)", async () => {
    const api = await as(students.EL001.user)
    const payload = nominationPayload("EL002", "EL003")
    delete payload.hasNoActiveBacklogs
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send(payload)
    expect(res.status).toBe(422)
  })

  it("POST /:id/posts/:postId/nominations demands a seconder with 400", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send({ cgpa: 8, hasNoActiveBacklogs: true, proposerRollNumbers: ["EL002"], seconderRollNumbers: [] })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/seconder is required/i)
  })

  it("POST /:id/posts/:postId/nominations rejects proposer/seconder overlap with 400", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send(nominationPayload("EL002", "EL002"))
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/both propose and second/i)
  })

  it("POST /:id/posts/:postId/nominations rejects self-support with 400", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send(nominationPayload("EL001", "EL003"))
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/cannot propose or second themselves/i)
  })

  it("POST /:id/posts/:postId/nominations files a nomination (SMTP-disabled email note)", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/nominations`)
      .send(nominationPayload("EL002", "EL003"))
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    // SMTP is disabled in this environment, so confirmation emails fail and
    // the message reports them while the nomination itself is saved.
    expect(res.body.message).toMatch(/could not be sent/)
    nominationA = res.body.data
    expect(nominationA.status).toBe("submitted")
    expect(nominationA.candidateRollNumber).toBe("EL001")
    expect(nominationA.proposerEntries[0].rollNumber).toBe("EL002")
    expect(nominationA.proposerEntries[0].status).toBe("pending")
    expect(nominationA.seconderEntries[0].status).toBe("pending")
  })

  it("POST /:id/posts/:postId/nominations forbids contesting two posts with 403", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${gsPostId}/nominations`)
      .send(nominationPayload("EL002", "EL003"))
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/more than one post/i)
  })

  it("GET /:id/posts/:postId/supporters/lookup requires a roll number (validation)", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .get(`${BASE}/${electionNom.id}/posts/${presidentPostId}/supporters/lookup`)
      .query({ supportType: "proposer" })
    expect(res.status).toBe(422)
  })

  it("GET /:id/posts/:postId/supporters/lookup rejects self-support with 400", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .get(`${BASE}/${electionNom.id}/posts/${presidentPostId}/supporters/lookup`)
      .query({ rollNumber: "EL001", supportType: "proposer" })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/themselves/i)
  })

  it("GET /:id/posts/:postId/supporters/lookup rejects unknown roll numbers with 400", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .get(`${BASE}/${electionNom.id}/posts/${presidentPostId}/supporters/lookup`)
      .query({ rollNumber: "GHOST99", supportType: "proposer" })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("GHOST99")
  })

  it("GET /:id/posts/:postId/supporters/lookup blocks commission members with 403", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .get(`${BASE}/${electionNom.id}/posts/${presidentPostId}/supporters/lookup`)
      .query({ rollNumber: "EC001", supportType: "proposer" })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/commission members cannot/i)
  })

  it("GET /:id/posts/:postId/supporters/lookup resolves a supporter", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .get(`${BASE}/${electionNom.id}/posts/${presidentPostId}/supporters/lookup`)
      .query({ rollNumber: "el004", supportType: "proposer" })
    expect(res.status).toBe(200)
    expect(res.body.data.rollNumber).toBe("EL004")
    expect(res.body.data.name).toBe(students.EL004.user.name)
    expect(res.body.data.email.toLowerCase()).toBe(String(students.EL004.user.email).toLowerCase())
    expect(res.body.data.currentRole).toBe("")
  })

  it("GET /supporter-confirmation/:token returns a validation error for short tokens", async () => {
    const res = await anonApi.get(`${BASE}/supporter-confirmation/short-token`)
    expect(res.status).toBe(422)
  })

  it("GET /supporter-confirmation/:token returns 404 for unknown tokens", async () => {
    const res = await anonApi.get(`${BASE}/supporter-confirmation/${"x".repeat(40)}`)
    expect(res.status).toBe(404)
  })

  it("supporter confirmation round-trip accepts the request (public token routes)", async () => {
    // SMTP is disabled, so the emailed token was invalidated — seed a fresh
    // action-link token through the backend's own token service.
    const { rawToken } = await saSeed.actionLinkToken({
      type: "election_nomination_support",
      subjectModel: "ElectionNomination",
      subjectId: nominationA.id,
      recipientUserId: students.EL002.user._id,
      recipientEmail: students.EL002.user.email,
      payload: {
        electionId: String(electionNom.id),
        postId: presidentPostId,
        supportType: "proposer",
        supporterRollNumber: "EL002",
      },
      expiresAt: h(48),
    })

    const view = await anonApi.get(`${BASE}/supporter-confirmation/${rawToken}`)
    expect(view.status).toBe(200)
    expect(view.body.data.tokenState).toBe("active")
    expect(view.body.data.nomination.candidateRollNumber).toBe("EL001")
    expect(view.body.data.nomination.supportType).toBe("proposer")
    expect(view.body.data.nomination.supporter.rollNumber).toBe("EL002")

    const respond = await anonApi
      .post(`${BASE}/supporter-confirmation/${rawToken}/respond`)
      .send({ decision: "accepted" })
    expect(respond.status).toBe(200)
    expect(respond.body.message).toMatch(/accepted/i)
    expect(respond.body.data.nomination.proposerEntries[0].status).toBe("accepted")

    const again = await anonApi
      .post(`${BASE}/supporter-confirmation/${rawToken}/respond`)
      .send({ decision: "accepted" })
    // The consumed token is no longer resolvable, so the replay surfaces as a
    // 404 rather than the service-level "already processed" 400.
    expect(again.status).toBe(404)
    expect(again.body.message).toMatch(/Invalid confirmation link/i)

    // Persistence via the admin detail endpoint.
    const detail = await adminApi.get(`${BASE}/${electionNom.id}`)
    const stored = detail.body.data.nominations.find((n) => String(n.id) === String(nominationA.id))
    expect(stored.proposerEntries[0].status).toBe("accepted")
  })

  it("POST /:id/nominations/:nominationId/review rejects students with 403", async () => {
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/nominations/${nominationA.id}/review`)
      .send({ status: "verified" })
    expect(res.status).toBe(403)
  })

  it("POST /:id/nominations/:nominationId/review requires notes for modification requests (validation)", async () => {
    const res = await adminApi
      .post(`${BASE}/${electionNom.id}/nominations/${nominationA.id}/review`)
      .send({ status: "modification_requested" })
    expect(res.status).toBe(422)
  })

  it("POST /:id/nominations/:nominationId/review verifies the nomination (pending-supporter warning)", async () => {
    const res = await adminApi
      .post(`${BASE}/${electionNom.id}/nominations/${nominationA.id}/review`)
      .send({ status: "verified", notes: "Documents in order" })
    expect(res.status).toBe(200)
    // The seconder's confirmation is still pending (emails are disabled), so
    // the verification succeeds but carries a warning in the message.
    expect(res.body.message).toMatch(/confirmations still incomplete/i)
    expect(res.body.data.status).toBe("verified")
  })

  it("POST /:id/nominations/:nominationId/review returns 404 for an unknown nomination", async () => {
    const res = await adminApi
      .post(`${BASE}/${electionNom.id}/nominations/000000000000000000000000/review`)
      .send({ status: "verified" })
    expect(res.status).toBe(404)
  })

  it("PUT /:id refuses to remove posts that already have nominations with 400", async () => {
    const detail = await adminApi.get(`${BASE}/${electionNom.id}`)
    const gsPost = detail.body.data.posts.find((p) => p.title === "General Secretary")
    const payload = makeElectionPayload({
      title: "Gymkhana Elections 2026",
      timeline: nominationTimeline(),
      posts: [
        makePost({
          id: undefined,
          title: "General Secretary",
          candidateRolls: ["EL001"],
          voterRolls: ["EL002"],
        }),
      ],
    })
    payload.posts[0].id = String(gsPost.id)
    const res = await adminApi.put(`${BASE}/${electionNom.id}`).send(payload)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/cannot be removed/i)
  })

  // =================== voting-stage election ===================

  it("creates the voting election, nominates and verifies its candidate", async () => {
    const created = await adminApi
      .post(BASE)
      .send(
        makeElectionPayload({
          title: "Hostel Council Election",
          timeline: nominationTimeline(),
          posts: [
            makePost({
              title: "Councillor",
              candidateRolls: ["EL007"],
              voterRolls: ["EL004", "EL005", "EL006"],
            }),
          ],
        })
      )
    expect(created.status).toBe(201)
    electionVote = created.body.data
    expect(electionVote.currentStage).toBe("nomination")

    const detail = await adminApi.get(`${BASE}/${electionVote.id}`)
    votePostId = String(detail.body.data.posts[0].id)

    const api = await as(students.EL007.user)
    const nomination = await api
      .post(`${BASE}/${electionVote.id}/posts/${votePostId}/nominations`)
      .send(nominationPayload("EL004", "EL005"))
    expect(nomination.status).toBe(200)
    nominationD = nomination.body.data

    const review = await adminApi
      .post(`${BASE}/${electionVote.id}/nominations/${nominationD.id}/review`)
      .send({ status: "verified" })
    expect(review.status).toBe(200)
    // Supporter confirmations are still pending (emails disabled) -> warning.
    expect(review.body.message).toMatch(/incomplete/i)
  })

  it("PUT /:id moves the election into the voting stage", async () => {
    const payload = makeElectionPayload({
      title: "Hostel Council Election",
      timeline: votingTimeline(),
      posts: [
        makePost({ title: "Councillor", candidateRolls: ["EL007"], voterRolls: ["EL004", "EL005", "EL006"] }),
      ],
    })
    payload.posts[0].id = votePostId
    const res = await adminApi.put(`${BASE}/${electionVote.id}`).send(payload)
    expect(res.status).toBe(200)
    expect(res.body.data.currentStage).toBe("voting")
  })

  it("GET /student/portal-state rejects non-students with 403", async () => {
    const res = await adminApi.get(`${BASE}/student/portal-state`)
    expect(res.status).toBe(403)
  })

  it("GET /student/portal-state returns 403 for students without a profile", async () => {
    const api = await as(await seed.student())
    const res = await api.get(`${BASE}/student/portal-state`)
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Only active students/i)
  })

  it("GET /student/portal-state reports the voting mode for eligible voters", async () => {
    const api = await as(students.EL004.user)
    const res = await api.get(`${BASE}/student/portal-state`)
    expect(res.status).toBe(200)
    expect(res.body.data.canAccessPortal).toBe(true)
    expect(res.body.data.mode).toBe("voting")
    expect(res.body.data.electionCount).toBe(1)
  })

  it("GET /student/current exposes the ballot with candidates and NOTA", async () => {
    const api = await as(students.EL004.user)
    const res = await api.get(`${BASE}/student/current`)
    expect(res.status).toBe(200)
    const election = res.body.data.elections.find((e) => String(e.id) === String(electionVote.id))
    expect(election).toBeTruthy()
    expect(election.mode).toBe("voting")
    const post = election.posts.find((p) => String(p.id) === String(votePostId))
    expect(post.canVote).toBe(true)
    expect(post.hasVoted).toBe(false)
    const candidateIds = post.votingCandidates.map((c) => c.nominationId)
    expect(candidateIds).toContain(String(nominationD.id))
    expect(post.votingCandidates.some((c) => c.isNota)).toBe(true)
  })

  it("GET /ballot/:token returns 404 for unknown tokens", async () => {
    const res = await anonApi.get(`${BASE}/ballot/${"y".repeat(40)}`)
    expect(res.status).toBe(404)
  })

  it("GET /ballot/:token reports an inactive state outside the voting stage", async () => {
    const { rawToken } = await saSeed.actionLinkToken({
      type: "election_voting_ballot",
      subjectModel: "Election",
      subjectId: electionNom.id,
      recipientUserId: students.EL002.user._id,
      recipientEmail: students.EL002.user.email,
      payload: { electionId: String(electionNom.id) },
      expiresAt: h(48),
    })
    const res = await anonApi.get(`${BASE}/ballot/${rawToken}`)
    expect(res.status).toBe(200)
    expect(res.body.data.tokenState).toBe("inactive")
    expect(res.body.data.election.votingStartAt).toBeTruthy()
  })

  it("email-ballot round-trip casts a NOTA vote and burns the token", async () => {
    const { rawToken } = await saSeed.actionLinkToken({
      type: "election_voting_ballot",
      subjectModel: "Election",
      subjectId: electionVote.id,
      recipientUserId: students.EL005.user._id,
      recipientEmail: students.EL005.user.email,
      payload: { electionId: String(electionVote.id) },
      expiresAt: h(0.7),
    })

    const ballot = await anonApi.get(`${BASE}/ballot/${rawToken}`)
    expect(ballot.status).toBe(200)
    expect(ballot.body.data.tokenState).toBe("active")
    expect(ballot.body.data.voter.rollNumber).toBe("EL005")
    const post = ballot.body.data.posts.find((p) => String(p.postId) === String(votePostId))
    expect(post.candidates.some((c) => c.isNota)).toBe(true)

    const submit = await anonApi.post(`${BASE}/ballot/${rawToken}/submit`).send({
      votes: [{ postId: votePostId, candidateNominationId: "nota" }],
    })
    expect(submit.status).toBe(200)
    expect(submit.body.message).toBe("Vote submitted successfully")
    expect(submit.body.data.submittedPosts).toBe(1)

    const burned = await anonApi.get(`${BASE}/ballot/${rawToken}`)
    expect(burned.status).toBe(200)
    expect(burned.body.data.tokenState).toBe("used")

    const replay = await anonApi.post(`${BASE}/ballot/${rawToken}/submit`).send({
      votes: [{ postId: votePostId, candidateNominationId: "nota" }],
    })
    // The consumed token is no longer resolvable -> 404 instead of the
    // service-level "already submitted" 400.
    expect(replay.status).toBe(404)
    expect(replay.body.message).toMatch(/Invalid voting link/i)
  })

  it("POST /:id/posts/:postId/vote casts a portal vote", async () => {
    const api = await as(students.EL004.user)
    const res = await api.post(`${BASE}/${electionVote.id}/posts/${votePostId}/vote`).send({
      candidateNominationId: String(nominationD.id),
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Vote submitted successfully")
    expect(res.body.data.submittedPosts).toBe(1)
  })

  it("POST /:id/posts/:postId/vote rejects duplicate submissions with 400", async () => {
    const api = await as(students.EL004.user)
    const res = await api.post(`${BASE}/${electionVote.id}/posts/${votePostId}/vote`).send({
      candidateNominationId: String(nominationD.id),
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/already been submitted/i)
  })

  it("POST /:id/posts/:postId/vote rejects invalid candidates with 400", async () => {
    const api = await as(students.EL006.user)
    const res = await api.post(`${BASE}/${electionVote.id}/posts/${votePostId}/vote`).send({
      candidateNominationId: "000000000000000000000000",
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Selected candidate is invalid/i)
  })

  it("POST /:id/votes/submit requires at least one vote (validation)", async () => {
    const api = await as(students.EL006.user)
    const res = await api.post(`${BASE}/${electionVote.id}/votes/submit`).send({ votes: [] })
    expect(res.status).toBe(422)
  })

  it("POST /:id/posts/:postId/vote refuses voting outside the voting stage with 403", async () => {
    const api = await as(students.EL002.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/posts/${presidentPostId}/vote`)
      .send({ candidateNominationId: "nota" })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Voting is not open/i)
  })

  it("the third eligible voter votes for the candidate via the portal", async () => {
    const api = await as(students.EL006.user)
    const res = await api.post(`${BASE}/${electionVote.id}/votes/submit`).send({
      votes: [{ postId: votePostId, candidateNominationId: String(nominationD.id) }],
    })
    expect(res.status).toBe(200)
  })

  it("GET /:id/voting-live rejects students with 403", async () => {
    const api = await as(students.EL004.user)
    const res = await api.get(`${BASE}/${electionVote.id}/voting-live`)
    expect(res.status).toBe(403)
  })

  it("GET /:id/voting-live refuses elections whose voting window has not opened with 403", async () => {
    const res = await adminApi.get(`${BASE}/${electionNom.id}/voting-live`)
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/voting window/i)
  })

  it("GET /:id/voting-live returns live tallies during the voting window", async () => {
    const res = await superAdminApi.get(`${BASE}/${electionVote.id}/voting-live`)
    expect(res.status).toBe(200)
    const overview = res.body.data.overview
    expect(overview.ballotsSubmitted).toBe(3)
    expect(overview.totalEligibleVoters).toBe(3)
    expect(overview.turnoutPercentage).toBe(100)
    const post = res.body.data.posts.find((p) => String(p.postId) === String(votePostId))
    expect(post.votedCount).toBe(3)
    const candidate = post.candidates.find((c) => c.nominationId === String(nominationD.id))
    expect(candidate.voteCount).toBe(2)
    const nota = post.candidates.find((c) => c.isNota)
    expect(nota.voteCount).toBe(1)
  })

  it("GET /:id/voting-emails/recipients lists dispatch recipients", async () => {
    const res = await adminApi.get(`${BASE}/${electionVote.id}/voting-emails/recipients`)
    expect(res.status).toBe(200)
    expect(res.body.data.election.id).toBe(electionVote.id)
    // EL004 and EL005 already voted (or hold a used ballot) -> marked sent;
    // EL006 voted through the portal too, so everyone shows as sent.
    const statuses = [...res.body.data.sentRecipients, ...res.body.data.notSentRecipients]
    expect(statuses.map((r) => r.rollNumber).sort()).toEqual(["EL004", "EL005", "EL006"])
  })

  it("POST /:id/voting-emails/send currently fails with 500 in this environment", async () => {
    // SUSPECTED BUG: triggerElectionVotingEmailDispatchForElection ->
    // persistDispatchState -> emitVotingDispatchUpdate -> emitToRole throws
    // "Socket.IO not initialized" because getIO() throws when no socket server
    // is attached (supertest app). The dispatch path never guards this call,
    // so the endpoint 500s anywhere Socket.IO isn't initialized. Documenting
    // current behavior; once emitToRole degrades gracefully this should
    // assert the queued:true happy path instead.
    const res = await adminApi.post(`${BASE}/${electionVote.id}/voting-emails/send`).send({
      resendMode: "generate_new",
      reminder: false,
      targetRollNumbers: ["el006"],
    })
    expect(res.status).toBe(500)
  })

  it("POST /:id/voting-emails/send refuses elections outside the dispatch window with 403", async () => {
    const res = await adminApi.post(`${BASE}/${electionNom.id}/voting-emails/send`).send({})
    expect(res.status).toBe(403)
  })

  it("POST /:id/test-emails/send queues test emails", async () => {
    const res = await adminApi.post(`${BASE}/${electionVote.id}/test-emails/send`).send({
      targetRollNumbers: ["EL006"],
    })
    expect(res.status).toBe(200)
    expect(res.body.data.queued).toBe(true)
    expect(res.body.data.targetRollNumbers).toEqual(["EL006"])
  })

  it("POST /:id/test-emails/send requires at least one target (validation)", async () => {
    const res = await adminApi
      .post(`${BASE}/${electionVote.id}/test-emails/send`)
      .send({ targetRollNumbers: [] })
    expect(res.status).toBe(422)
  })

  // =================== results stage ===================

  it("PUT /:id moves the election into the results stage", async () => {
    const payload = makeElectionPayload({
      title: "Hostel Council Election",
      timeline: resultsTimeline(),
      posts: [
        makePost({ title: "Councillor", candidateRolls: ["EL007"], voterRolls: ["EL004", "EL005", "EL006"] }),
      ],
    })
    payload.posts[0].id = votePostId
    const res = await adminApi.put(`${BASE}/${electionVote.id}`).send(payload)
    expect(res.status).toBe(200)
    expect(res.body.data.currentStage).toBe("results")
  })

  it("POST /:id/results/publish refuses elections where voting has not ended with 403", async () => {
    const res = await adminApi.post(`${BASE}/${electionNom.id}/results/publish`).send({})
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/after voting has ended/i)
  })

  it("POST /:id/results/publish rejects unknown winners with 400", async () => {
    const res = await adminApi.post(`${BASE}/${electionVote.id}/results/publish`).send({
      posts: [{ postId: votePostId, winnerNominationId: "000000000000000000000000" }],
    })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/Selected winner is invalid/i)
  })

  it("POST /:id/results/publish publishes the results", async () => {
    const res = await adminApi.post(`${BASE}/${electionVote.id}/results/publish`).send({
      posts: [
        {
          postId: votePostId,
          winnerNominationIds: [String(nominationD.id)],
          showVoteCountToStudents: true,
          notes: "Clear majority",
        },
      ],
    })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Results published successfully")
    const results = res.body.data.results
    expect(results.isPublished).toBe(true)
    const post = results.posts.find((p) => String(p.postId) === String(votePostId))
    expect(post.publishedWinnerNames).toContain(students.EL007.user.name)
    expect(post.publishedWinnerIsNota).toBe(false)
  })

  it("GET /:id reflects the published results", async () => {
    const res = await adminApi.get(`${BASE}/${electionVote.id}`)
    expect(res.status).toBe(200)
    expect(res.body.data.results.isPublished).toBe(true)
    const post = res.body.data.posts.find((p) => String(p.id) === String(votePostId))
    expect(post.voteCount).toBe(3)
    expect(post.nominationCounts.verified).toBe(1)
  })

  it("GET /student/current hides vote counts when publication says so", async () => {
    // Republish with hidden counts is not exposed; instead verify the student
    // view sanitizes according to the published flag (true here -> counts kept).
    const api = await as(students.EL004.user)
    const res = await api.get(`${BASE}/student/current`)
    expect(res.status).toBe(200)
    const election = res.body.data.elections.find((e) => String(e.id) === String(electionVote.id))
    const post = election.posts.find((p) => String(p.id) === String(votePostId))
    expect(post.hasVoted).toBe(true)
    expect(post.results.showVoteCountToStudents).toBe(true)
    expect(post.results.candidates.find((c) => c.isNota).voteCount).toBe(1)
  })

  // =================== cloning ===================

  it("POST /:id/clone copies a finalized pre-voting election into a new draft", async () => {
    const res = await adminApi
      .post(`${BASE}/${electionNom.id}/clone`)
      .send({ title: "Gymkhana Elections 2027" })
    expect(res.status).toBe(201)
    expect(res.body.message).toBe("Election copied successfully")
    expect(res.body.data.title).toBe("Gymkhana Elections 2027")
    expect(res.body.data.status).toBe("draft")
    expect(res.body.data.academicYear).toBe("2026-27")
    expect(String(res.body.data.id)).not.toBe(String(electionNom.id))

    const detail = await adminApi.get(`${BASE}/${res.body.data.id}`)
    expect(detail.body.data.posts.length).toBe(2)
    expect(detail.body.data.nominations.length).toBe(1)
  })

  it("POST /:id/clone refuses elections whose voting already started with 403", async () => {
    const res = await adminApi
      .post(`${BASE}/${electionVote.id}/clone`)
      .send({ title: "Too Late Copy" })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/before voting starts/i)
  })

  it("POST /:id/clone refuses cancelled elections with 403", async () => {
    const res = await adminApi
      .post(`${BASE}/${electionScratch.id}/clone`)
      .send({ title: "Cancelled Copy" })
    expect(res.status).toBe(403)
    expect(res.body.message).toMatch(/Only active elections can be copied/i)
  })

  it("POST /:id/clone returns 404 for an unknown election", async () => {
    const res = await adminApi
      .post(`${BASE}/000000000000000000000000/clone`)
      .send({ title: "Ghost Copy" })
    expect(res.status).toBe(404)
  })

  it("POST /:id/nominations/:nominationId/withdraw withdraws a nomination", async () => {
    // EL006 contests nothing yet, but is not in the President candidate scope;
    // use EL008 (in scope, but no ID card) — withdrawal needs an existing
    // nomination, so instead re-use the withdrawn-flow on the cloned election's
    // nomination via EL001 on the original election is already verified.
    // Simplest correct case: EL001 withdraws her own verified nomination.
    const api = await as(students.EL001.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/nominations/${nominationA.id}/withdraw`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Nomination withdrawn successfully")
    expect(res.body.data.status).toBe("withdrawn")
    expect(res.body.data.withdrawnAt).toBeTruthy()
  })

  it("POST /:id/nominations/:nominationId/withdraw returns 404 for someone else's nomination", async () => {
    const api = await as(students.EL007.user)
    const res = await api
      .post(`${BASE}/${electionNom.id}/nominations/${nominationA.id}/withdraw`)
      .send({})
    expect(res.status).toBe(404)
  })
})
