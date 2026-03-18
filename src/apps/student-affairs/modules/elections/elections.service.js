import mongoose from "mongoose"
import {
  Election,
  ElectionNomination,
  ElectionVote,
  StudentProfile,
  User,
} from "../../../../models/index.js"
import {
  badRequest,
  created,
  forbidden,
  notFound,
  success,
} from "../../../../services/base/index.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import {
  DEFAULT_POST_REQUIREMENTS_BY_CATEGORY,
  ELECTION_POST_CATEGORY,
  ELECTION_STAGE,
  ELECTION_STATUS,
  NOMINATION_STATUS,
} from "./elections.constants.js"

const normalizeStringArray = (values = []) => {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))]
}

const normalizeRollNumbers = (values = []) => {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))]
}

const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const isAdminUser = (user) => {
  return user?.role === ROLES.ADMIN || user?.role === ROLES.SUPER_ADMIN
}

const hasUploadedIdCard = (studentProfile) => {
  return Boolean(studentProfile?.idCard?.front || studentProfile?.idCard?.back)
}

const getCurrentStage = (election, currentTime = new Date()) => {
  if (!election) return ELECTION_STAGE.DRAFT
  if (election.status === ELECTION_STATUS.CANCELLED) return ELECTION_STAGE.CANCELLED
  if (election.status === ELECTION_STATUS.DRAFT) return ELECTION_STAGE.DRAFT
  if (election.status === ELECTION_STATUS.COMPLETED) return ELECTION_STAGE.COMPLETED

  const timeline = election.timeline || {}

  if (timeline.announcementAt && currentTime < new Date(timeline.nominationStartAt)) {
    return ELECTION_STAGE.ANNOUNCED
  }
  if (
    timeline.nominationStartAt &&
    timeline.nominationEndAt &&
    currentTime >= new Date(timeline.nominationStartAt) &&
    currentTime <= new Date(timeline.nominationEndAt)
  ) {
    return ELECTION_STAGE.NOMINATION
  }
  if (
    timeline.nominationEndAt &&
    timeline.withdrawalEndAt &&
    currentTime > new Date(timeline.nominationEndAt) &&
    currentTime <= new Date(timeline.withdrawalEndAt)
  ) {
    return ELECTION_STAGE.WITHDRAWAL
  }
  if (
    timeline.campaigningStartAt &&
    timeline.campaigningEndAt &&
    currentTime >= new Date(timeline.campaigningStartAt) &&
    currentTime <= new Date(timeline.campaigningEndAt)
  ) {
    return ELECTION_STAGE.CAMPAIGNING
  }
  if (
    timeline.votingStartAt &&
    timeline.votingEndAt &&
    currentTime >= new Date(timeline.votingStartAt) &&
    currentTime <= new Date(timeline.votingEndAt)
  ) {
    return ELECTION_STAGE.VOTING
  }
  if (
    timeline.resultsAnnouncedAt &&
    (!timeline.handoverAt || currentTime < new Date(timeline.handoverAt)) &&
    currentTime >= new Date(timeline.resultsAnnouncedAt)
  ) {
    return ELECTION_STAGE.RESULTS
  }
  if (timeline.handoverAt && currentTime >= new Date(timeline.handoverAt)) {
    return ELECTION_STAGE.HANDOVER
  }

  if (timeline.votingEndAt && currentTime > new Date(timeline.votingEndAt)) {
    return ELECTION_STAGE.RESULTS
  }

  return ELECTION_STAGE.ANNOUNCED
}

const isStudentPortalVisibleStage = (stage) => {
  return [
    ELECTION_STAGE.NOMINATION,
    ELECTION_STAGE.WITHDRAWAL,
    ELECTION_STAGE.VOTING,
    ELECTION_STAGE.RESULTS,
    ELECTION_STAGE.HANDOVER,
  ].includes(stage)
}

const getStudentPortalMode = (stage) => {
  if (stage === ELECTION_STAGE.VOTING) return "voting"
  if ([ELECTION_STAGE.NOMINATION, ELECTION_STAGE.WITHDRAWAL].includes(stage)) return "participation"
  if ([ELECTION_STAGE.RESULTS, ELECTION_STAGE.HANDOVER].includes(stage)) return "results"
  return "none"
}

const validateTimelineOrder = (timeline = {}) => {
  const entries = [
    ["announcementAt", timeline.announcementAt],
    ["nominationStartAt", timeline.nominationStartAt],
    ["nominationEndAt", timeline.nominationEndAt],
    ["withdrawalEndAt", timeline.withdrawalEndAt],
    ["campaigningStartAt", timeline.campaigningStartAt],
    ["campaigningEndAt", timeline.campaigningEndAt],
    ["votingStartAt", timeline.votingStartAt],
    ["votingEndAt", timeline.votingEndAt],
    ["resultsAnnouncedAt", timeline.resultsAnnouncedAt],
  ]

  const parsed = entries.map(([key, value]) => [key, toDate(value)])
  for (const [key, value] of parsed) {
    if (!value) {
      return badRequest(`Invalid timeline date for ${key}`)
    }
  }

  for (let index = 0; index < parsed.length - 1; index += 1) {
    const [currentKey, currentValue] = parsed[index]
    const [nextKey, nextValue] = parsed[index + 1]
    if (currentValue > nextValue) {
      return badRequest(`Timeline order is invalid: ${currentKey} must be before ${nextKey}`)
    }
  }

  if (timeline.handoverAt) {
    const handoverAt = toDate(timeline.handoverAt)
    if (!handoverAt) {
      return badRequest("Invalid timeline date for handoverAt")
    }
    if (handoverAt < parsed[parsed.length - 1][1]) {
      return badRequest("handoverAt must be on or after resultsAnnouncedAt")
    }
  }

  return success(true)
}

const getProfilesForRollNumbers = async (rollNumbers = []) => {
  const normalizedRollNumbers = normalizeRollNumbers(rollNumbers)
  if (normalizedRollNumbers.length === 0) return []

  return StudentProfile.find({ rollNumber: { $in: normalizedRollNumbers }, status: "Active" })
    .populate({
      path: "userId",
      select: "name email role",
    })
}

const validateRollNumberUsersExist = async (rollNumbers = [], label = "roll numbers") => {
  const normalizedRollNumbers = normalizeRollNumbers(rollNumbers)
  if (normalizedRollNumbers.length === 0) {
    return success({
      rollNumbers: [],
      profiles: [],
    })
  }

  const profiles = await getProfilesForRollNumbers(normalizedRollNumbers)
  const found = new Set(profiles.map((profile) => String(profile.rollNumber).toUpperCase()))
  const missing = normalizedRollNumbers.filter((rollNumber) => !found.has(rollNumber))

  if (missing.length > 0) {
    return badRequest(`Unknown ${label}: ${missing.join(", ")}`)
  }

  return success({
    rollNumbers: normalizedRollNumbers,
    profiles,
  })
}

const normalizeScope = async (scope = {}, label = "students") => {
  const batches = normalizeStringArray(scope?.batches)
  const rollNumberResult = await validateRollNumberUsersExist(scope?.extraRollNumbers, label)
  if (!rollNumberResult.success) return rollNumberResult

  if (batches.length === 0 && rollNumberResult.data.rollNumbers.length === 0) {
    return badRequest(`At least one batch or CSV student must be configured for ${label}`)
  }

  return success({
    batches,
    extraRollNumbers: rollNumberResult.data.rollNumbers,
  })
}

const normalizeElectionCommission = async (commission = {}) => {
  const chiefElectionOfficerRollNumber = String(commission?.chiefElectionOfficerRollNumber || "")
    .trim()
    .toUpperCase()

  const officerRollNumbers = normalizeRollNumbers(commission?.officerRollNumbers)

  const combined = [
    ...(chiefElectionOfficerRollNumber ? [chiefElectionOfficerRollNumber] : []),
    ...officerRollNumbers,
  ]
  const validationResult = await validateRollNumberUsersExist(combined, "election commission roll numbers")
  if (!validationResult.success) return validationResult

  return success({
    chiefElectionOfficerRollNumber,
    officerRollNumbers: officerRollNumbers.filter((rollNumber) => rollNumber !== chiefElectionOfficerRollNumber),
  })
}

const normalizePostRequirements = (category, requirements = {}) => {
  const defaults =
    DEFAULT_POST_REQUIREMENTS_BY_CATEGORY[category] ||
    DEFAULT_POST_REQUIREMENTS_BY_CATEGORY[ELECTION_POST_CATEGORY.CUSTOM]

  return {
    ...defaults,
    ...requirements,
    allowedHostelNames: normalizeStringArray(requirements?.allowedHostelNames),
  }
}

const normalizeElectionPayload = async (payload = {}) => {
  const timelineResult = validateTimelineOrder(payload.timeline)
  if (!timelineResult.success) return timelineResult

  const commissionResult = await normalizeElectionCommission(payload.electionCommission)
  if (!commissionResult.success) return commissionResult

  const posts = []
  for (const post of payload.posts || []) {
    const candidateScopeResult = await normalizeScope(
      post.candidateEligibility,
      `candidate eligibility for ${post.title}`
    )
    if (!candidateScopeResult.success) return candidateScopeResult

    const voterScopeResult = await normalizeScope(
      post.voterEligibility,
      `voter eligibility for ${post.title}`
    )
    if (!voterScopeResult.success) return voterScopeResult

    posts.push({
      ...(post.id ? { _id: post.id } : {}),
      title: post.title.trim(),
      code: String(post.code || "").trim().toUpperCase(),
      category: post.category || ELECTION_POST_CATEGORY.CUSTOM,
      description: String(post.description || "").trim(),
      candidateEligibility: candidateScopeResult.data,
      voterEligibility: voterScopeResult.data,
      requirements: normalizePostRequirements(post.category, post.requirements),
    })
  }

  return success({
    title: String(payload.title || "").trim(),
    academicYear: String(payload.academicYear || "").trim(),
    phase: payload.phase,
    description: String(payload.description || "").trim(),
    status: payload.status,
    electionCommission: commissionResult.data,
    timeline: {
      announcementAt: toDate(payload.timeline.announcementAt),
      nominationStartAt: toDate(payload.timeline.nominationStartAt),
      nominationEndAt: toDate(payload.timeline.nominationEndAt),
      withdrawalEndAt: toDate(payload.timeline.withdrawalEndAt),
      campaigningStartAt: toDate(payload.timeline.campaigningStartAt),
      campaigningEndAt: toDate(payload.timeline.campaigningEndAt),
      votingStartAt: toDate(payload.timeline.votingStartAt),
      votingEndAt: toDate(payload.timeline.votingEndAt),
      resultsAnnouncedAt: toDate(payload.timeline.resultsAnnouncedAt),
      handoverAt: payload.timeline.handoverAt ? toDate(payload.timeline.handoverAt) : null,
    },
    posts,
  })
}

const resolvePostById = (election, postId) => {
  const normalizedPostId = String(postId)
  const post = (election?.posts || []).find((item) => String(item._id) === normalizedPostId)
  return post || null
}

const buildCommissionRollNumberSet = (election) => {
  const chief = election?.electionCommission?.chiefElectionOfficerRollNumber || ""
  const officers = election?.electionCommission?.officerRollNumbers || []
  return new Set(normalizeRollNumbers([chief, ...officers]))
}

const getEligibleStudentProfilesForScope = async (scope = {}) => {
  const batches = normalizeStringArray(scope?.batches)
  const extraRollNumbers = normalizeRollNumbers(scope?.extraRollNumbers)
  if (batches.length === 0 && extraRollNumbers.length === 0) return []

  const query = {
    status: "Active",
    $or: [],
  }

  if (batches.length > 0) {
    query.$or.push({ batch: { $in: batches } })
  }
  if (extraRollNumbers.length > 0) {
    query.$or.push({ rollNumber: { $in: extraRollNumbers } })
  }

  return StudentProfile.find(query)
    .populate({
      path: "userId",
      select: "name email role",
    })
}

const getStudentProfileWithRelations = async (userId) => {
  return StudentProfile.findOne({ userId, status: "Active" })
    .populate({
      path: "userId",
      select: "name email role",
    })
    .populate({
      path: "currentRoomAllocation",
      populate: {
        path: "hostelId",
        select: "name",
      },
    })
}

const doesProfileMatchScope = (profile, scope = {}) => {
  if (!profile) return false

  const batches = normalizeStringArray(scope?.batches)
  const extraRollNumbers = normalizeRollNumbers(scope?.extraRollNumbers)

  if (batches.length === 0 && extraRollNumbers.length === 0) {
    return false
  }

  const profileBatch = String(profile.batch || "").trim()
  const profileRollNumber = String(profile.rollNumber || "").trim().toUpperCase()

  return batches.includes(profileBatch) || extraRollNumbers.includes(profileRollNumber)
}

const serializeScope = (scope = {}) => ({
  batches: normalizeStringArray(scope?.batches),
  extraRollNumbers: normalizeRollNumbers(scope?.extraRollNumbers),
})

const serializePost = (post) => ({
  id: post._id,
  title: post.title,
  code: post.code || "",
  category: post.category,
  description: post.description || "",
  candidateEligibility: serializeScope(post.candidateEligibility),
  voterEligibility: serializeScope(post.voterEligibility),
  requirements: {
    minCgpa: Number(post.requirements?.minCgpa || 0),
    minCompletedSemestersUg: Number(post.requirements?.minCompletedSemestersUg || 0),
    minCompletedSemestersPg: Number(post.requirements?.minCompletedSemestersPg || 0),
    minRemainingSemesters: Number(post.requirements?.minRemainingSemesters || 0),
    proposersRequired: Number(post.requirements?.proposersRequired || 0),
    secondersRequired: Number(post.requirements?.secondersRequired || 0),
    requireElectorateMembership: Boolean(post.requirements?.requireElectorateMembership),
    requireHostelResident: Boolean(post.requirements?.requireHostelResident),
    allowedHostelNames: normalizeStringArray(post.requirements?.allowedHostelNames),
    notes: post.requirements?.notes || "",
  },
})

const serializeNomination = (nomination) => ({
  id: nomination._id,
  electionId: nomination.electionId,
  postId: nomination.postId,
  postTitle: nomination.postTitle,
  candidateUserId: nomination.candidateUserId?._id || nomination.candidateUserId,
  candidateName: nomination.candidateUserId?.name || "",
  candidateEmail: nomination.candidateUserId?.email || "",
  candidateRollNumber: nomination.candidateRollNumber,
  candidateBatch: nomination.candidateBatch || "",
  pitch: nomination.pitch || "",
  agendaPoints: Array.isArray(nomination.agendaPoints) ? nomination.agendaPoints : [],
  cgpa: nomination.cgpa,
  completedSemesters: nomination.completedSemesters,
  remainingSemesters: nomination.remainingSemesters,
  proposerRollNumbers: nomination.proposerRollNumbers || [],
  seconderRollNumbers: nomination.seconderRollNumbers || [],
  gradeCardUrl: nomination.gradeCardUrl || "",
  manifestoUrl: nomination.manifestoUrl || "",
  porDocumentUrl: nomination.porDocumentUrl || "",
  candidateIdCard: {
    front: nomination.candidateProfileId?.idCard?.front || "",
    back: nomination.candidateProfileId?.idCard?.back || "",
  },
  attachments: nomination.attachments || [],
  status: nomination.status,
  review: nomination.review || {},
  submittedAt: nomination.submittedAt,
  withdrawnAt: nomination.withdrawnAt,
  createdAt: nomination.createdAt,
  updatedAt: nomination.updatedAt,
})

const serializeElectionBase = (election) => ({
  id: election._id,
  title: election.title,
  academicYear: election.academicYear,
  phase: election.phase,
  description: election.description || "",
  status: election.status,
  currentStage: getCurrentStage(election),
  timeline: election.timeline,
  electionCommission: {
    chiefElectionOfficerRollNumber: election.electionCommission?.chiefElectionOfficerRollNumber || "",
    officerRollNumbers: election.electionCommission?.officerRollNumbers || [],
  },
  createdAt: election.createdAt,
  updatedAt: election.updatedAt,
})

const buildPublishedResultMap = (election) =>
  new Map(
    (election?.resultPublication?.posts || []).map((item) => [
      String(item.postId),
      {
        winnerNominationId: item.winnerNominationId ? String(item.winnerNominationId) : null,
        notes: item.notes || "",
      },
    ])
  )

const buildElectionResults = async (election) => {
  const verifiedNominations = await ElectionNomination.find({
    electionId: election._id,
    status: NOMINATION_STATUS.VERIFIED,
  }).populate({ path: "candidateUserId", select: "name email" })

  const voteCounts = await ElectionVote.aggregate([
    {
      $match: {
        electionId: new mongoose.Types.ObjectId(String(election._id)),
      },
    },
    {
      $group: {
        _id: {
          postId: "$postId",
          candidateNominationId: "$candidateNominationId",
        },
        count: { $sum: 1 },
      },
    },
  ])

  const voteMap = new Map(
    voteCounts.map((item) => [
      `${String(item._id.postId)}:${String(item._id.candidateNominationId)}`,
      Number(item.count || 0),
    ])
  )
  const publishedResultMap = buildPublishedResultMap(election)

  const posts = (election.posts || []).map((post) => {
    const postId = String(post._id)
    const postNominations = verifiedNominations
      .filter((nomination) => String(nomination.postId) === postId)
      .map((nomination) => ({
        nominationId: String(nomination._id),
        candidateName: nomination.candidateUserId?.name || nomination.candidateRollNumber,
        candidateEmail: nomination.candidateUserId?.email || "",
        candidateRollNumber: nomination.candidateRollNumber,
        voteCount: voteMap.get(`${postId}:${String(nomination._id)}`) || 0,
      }))
      .sort((left, right) => {
        if (right.voteCount !== left.voteCount) return right.voteCount - left.voteCount
        return String(left.candidateName || "").localeCompare(String(right.candidateName || ""))
      })

    const previewWinner = postNominations[0] || null
    const publishedResult = publishedResultMap.get(postId) || null
    const publishedWinner =
      postNominations.find(
        (candidate) => String(candidate.nominationId) === String(publishedResult?.winnerNominationId || "")
      ) || null

    return {
      postId,
      postTitle: post.title,
      totalVotes: postNominations.reduce((total, item) => total + Number(item.voteCount || 0), 0),
      candidates: postNominations,
      previewWinnerNominationId: previewWinner?.nominationId || null,
      previewWinnerName: previewWinner?.candidateName || "",
      publishedWinnerNominationId: publishedResult?.winnerNominationId || null,
      publishedWinnerName: publishedWinner?.candidateName || "",
      notes: publishedResult?.notes || "",
    }
  })

  return {
    isPublished: Boolean(election?.resultPublication?.isPublished),
    publishedAt: election?.resultPublication?.publishedAt || null,
    publishedBy: election?.resultPublication?.publishedBy || null,
    posts,
  }
}

const getNominationCountsByPost = async (electionId) => {
  const counts = await ElectionNomination.aggregate([
    {
      $match: {
        electionId: new mongoose.Types.ObjectId(String(electionId)),
      },
    },
    {
      $group: {
        _id: {
          postId: "$postId",
          status: "$status",
        },
        count: { $sum: 1 },
      },
    },
  ])

  return counts.reduce((acc, item) => {
    const postId = String(item._id.postId)
    if (!acc[postId]) {
      acc[postId] = {
        submitted: 0,
        verified: 0,
        modification_requested: 0,
        rejected: 0,
        withdrawn: 0,
      }
    }
    acc[postId][item._id.status] = item.count
    return acc
  }, {})
}

const getVoteCountsByPost = async (electionId) => {
  const counts = await ElectionVote.aggregate([
    {
      $match: {
        electionId: new mongoose.Types.ObjectId(String(electionId)),
      },
    },
    {
      $group: {
        _id: "$postId",
        count: { $sum: 1 },
      },
    },
  ])

  return counts.reduce((acc, item) => {
    acc[String(item._id)] = item.count
    return acc
  }, {})
}

const getVisiblePublishedElections = async () => {
  const elections = await Election.find({ status: ELECTION_STATUS.PUBLISHED }).sort({
    "timeline.votingStartAt": -1,
    createdAt: -1,
  })

  return elections.filter((election) => isStudentPortalVisibleStage(getCurrentStage(election)))
}

const getRelevantPostsForStudent = (election, studentProfile, posts = [], myNominationMap = new Map(), myVoteMap = new Map()) => {
  const stage = getCurrentStage(election)
  const mode = getStudentPortalMode(stage)

  return posts.filter((post) => {
    const postKey = `${String(election._id)}:${String(post._id)}`
    const myNomination = myNominationMap.get(postKey)
    const myVote = myVoteMap.get(postKey)
    const canStand = doesProfileMatchScope(studentProfile, post.candidateEligibility)
    const canVote = doesProfileMatchScope(studentProfile, post.voterEligibility)

    if (mode === "voting") return canVote || Boolean(myVote)
    if (mode === "participation") return canStand || Boolean(myNomination)
    if (mode === "results") return canStand || canVote || Boolean(myNomination) || Boolean(myVote)
    return false
  })
}

class ElectionsService {
  async listAdminElections(query = {}) {
    const filter = {}

    if (query.status) filter.status = query.status
    if (query.phase) filter.phase = query.phase
    if (query.search) {
      filter.$or = [
        { title: { $regex: query.search, $options: "i" } },
        { academicYear: { $regex: query.search, $options: "i" } },
      ]
    }

    const elections = await Election.find(filter).sort({
      "timeline.votingStartAt": -1,
      createdAt: -1,
    })

    return success({
      elections: elections.map((election) => ({
        ...serializeElectionBase(election),
        postCount: election.posts?.length || 0,
      })),
    })
  }

  async getElectionDetail(id, user) {
    const election = await Election.findById(id)
    if (!election) return notFound("Election")

    const nominationCountsByPost = await getNominationCountsByPost(election._id)
    const voteCountsByPost = await getVoteCountsByPost(election._id)

    const base = serializeElectionBase(election)
    const posts = (election.posts || []).map((post) => ({
      ...serializePost(post),
      nominationCounts: nominationCountsByPost[String(post._id)] || {
        submitted: 0,
        verified: 0,
        modification_requested: 0,
        rejected: 0,
        withdrawn: 0,
      },
      voteCount: voteCountsByPost[String(post._id)] || 0,
    }))

    const response = {
      ...base,
      posts,
      results: await buildElectionResults(election),
    }

    if (isAdminUser(user)) {
      const nominations = await ElectionNomination.find({ electionId: election._id })
        .populate({ path: "candidateUserId", select: "name email" })
        .populate({ path: "candidateProfileId", select: "idCard" })
        .sort({ createdAt: -1 })

      response.nominations = nominations.map(serializeNomination)
    }

    return success(response)
  }

  async createElection(payload, user) {
    const normalizedResult = await normalizeElectionPayload(payload)
    if (!normalizedResult.success) return normalizedResult

    const election = await Election.create({
      ...normalizedResult.data,
      createdBy: user._id,
      updatedBy: user._id,
    })

    return created(serializeElectionBase(election), "Election created successfully")
  }

  async updateElection(id, payload, user) {
    const election = await Election.findById(id)
    if (!election) return notFound("Election")

    const normalizedResult = await normalizeElectionPayload(payload)
    if (!normalizedResult.success) return normalizedResult

    const existingPostIds = new Set((election.posts || []).map((post) => String(post._id)))
    const incomingPostIds = new Set(
      (normalizedResult.data.posts || [])
        .map((post) => (post?._id ? String(post._id) : ""))
        .filter(Boolean)
    )

    const removedPostIds = [...existingPostIds].filter((postId) => !incomingPostIds.has(postId))
    if (removedPostIds.length > 0) {
      const linkedActivityCount = await Promise.all([
        ElectionNomination.countDocuments({
          electionId: election._id,
          postId: { $in: removedPostIds.map((postId) => new mongoose.Types.ObjectId(postId)) },
        }),
        ElectionVote.countDocuments({
          electionId: election._id,
          postId: { $in: removedPostIds.map((postId) => new mongoose.Types.ObjectId(postId)) },
        }),
      ])

      if (linkedActivityCount[0] > 0 || linkedActivityCount[1] > 0) {
        return badRequest("Posts with existing nominations or votes cannot be removed")
      }
    }

    Object.assign(election, normalizedResult.data, { updatedBy: user._id })
    await election.save()

    return success(serializeElectionBase(election), 200, "Election updated successfully")
  }

  async getStudentPortalState(user) {
    const studentProfile = await getStudentProfileWithRelations(user._id)
    if (!studentProfile) {
      return forbidden("Only active students can access elections")
    }

    const elections = await getVisiblePublishedElections()
    const relevantElections = elections.filter((election) => {
      const stage = getCurrentStage(election)
      if (getStudentPortalMode(stage) === "voting") {
        return (election.posts || []).some((post) => doesProfileMatchScope(studentProfile, post.voterEligibility))
      }
      if (getStudentPortalMode(stage) === "participation") {
        return (election.posts || []).some((post) => doesProfileMatchScope(studentProfile, post.candidateEligibility))
      }
      if (getStudentPortalMode(stage) === "results") {
        return (election.posts || []).some((post) =>
          doesProfileMatchScope(studentProfile, post.candidateEligibility) ||
          doesProfileMatchScope(studentProfile, post.voterEligibility)
        )
      }
      return false
    })
    const modes = relevantElections.map((election) => getStudentPortalMode(getCurrentStage(election)))

    const mode = modes.includes("voting")
      ? "voting"
      : modes.includes("participation")
        ? "participation"
        : modes.includes("results")
          ? "results"
        : "none"

    return success({
      canAccessPortal: mode !== "none",
      mode,
      navLabel: "Elections",
      electionCount: relevantElections.length,
    })
  }

  async getStudentCurrentElections(user) {
    const studentProfile = await getStudentProfileWithRelations(user._id)
    if (!studentProfile) {
      return forbidden("Only active students can access elections")
    }

    const elections = await getVisiblePublishedElections()
    const electionIds = elections.map((item) => item._id)

    const [myNominations, myVotes] = await Promise.all([
      ElectionNomination.find({
        electionId: { $in: electionIds },
        candidateUserId: user._id,
      })
        .populate({ path: "candidateUserId", select: "name email" })
        .populate({ path: "candidateProfileId", select: "idCard" }),
      ElectionVote.find({
        electionId: { $in: electionIds },
        voterUserId: user._id,
      }),
    ])

    const myNominationMap = new Map(
      myNominations.map((nomination) => [`${String(nomination.electionId)}:${String(nomination.postId)}`, nomination])
    )
    const myVoteMap = new Map(
      myVotes.map((vote) => [`${String(vote.electionId)}:${String(vote.postId)}`, vote])
    )

    const currentElections = []
    for (const election of elections) {
      const stage = getCurrentStage(election)
      const electionMode = getStudentPortalMode(stage)
      const electionResults = await buildElectionResults(election)
      const resultsByPost = new Map(
        (electionResults.posts || []).map((item) => [String(item.postId), item])
      )
      const approvedNominations = await ElectionNomination.find({
        electionId: election._id,
        status: NOMINATION_STATUS.VERIFIED,
      })
        .populate({ path: "candidateUserId", select: "name email" })
        .populate({ path: "candidateProfileId", select: "idCard" })

      const approvedByPost = approvedNominations.reduce((acc, nomination) => {
        const key = String(nomination.postId)
        if (!acc[key]) acc[key] = []
        acc[key].push(serializeNomination(nomination))
        return acc
      }, {})

      const relevantPosts = getRelevantPostsForStudent(
        election,
        studentProfile,
        election.posts || [],
        myNominationMap,
        myVoteMap
      )

      const posts = relevantPosts.map((post) => {
        const postKey = `${String(election._id)}:${String(post._id)}`
        const myNomination = myNominationMap.get(postKey)
        const myVote = myVoteMap.get(postKey)

        return {
          ...serializePost(post),
          canStand: doesProfileMatchScope(studentProfile, post.candidateEligibility),
          canVote: doesProfileMatchScope(studentProfile, post.voterEligibility),
          myNomination: myNomination ? serializeNomination(myNomination) : null,
          hasVoted: Boolean(myVote),
          votedCandidateNominationId: myVote?.candidateNominationId || null,
          approvedCandidates: approvedByPost[String(post._id)] || [],
          results: resultsByPost.get(String(post._id)) || null,
        }
      })

      if (posts.length === 0) {
        continue
      }

      currentElections.push({
        ...serializeElectionBase(election),
        mode: electionMode,
        results: electionResults,
        posts,
      })
    }

    return success({
      elections: currentElections,
    })
  }

  async upsertNomination(electionId, postId, payload, user) {
    const election = await Election.findById(electionId)
    if (!election) return notFound("Election")

    const stage = getCurrentStage(election)
    if (stage !== ELECTION_STAGE.NOMINATION) {
      return forbidden("Nominations are not open for this election right now")
    }

    const post = resolvePostById(election, postId)
    if (!post) return notFound("Election post")

    const studentProfile = await getStudentProfileWithRelations(user._id)
    if (!studentProfile) {
      return forbidden("Only active students can file nominations")
    }

    if (!doesProfileMatchScope(studentProfile, post.candidateEligibility)) {
      return forbidden("You are not eligible to contest for this post")
    }

    if (!hasUploadedIdCard(studentProfile)) {
      return forbidden("Upload your student ID card before submitting nomination")
    }

    const commissionRollNumbers = buildCommissionRollNumberSet(election)
    if (commissionRollNumbers.has(String(studentProfile.rollNumber || "").toUpperCase())) {
      return forbidden("Election commission members cannot contest elections")
    }

    if (post.requirements?.requireHostelResident) {
      const hostelName = studentProfile?.currentRoomAllocation?.hostelId?.name || ""
      if (!hostelName) {
        return forbidden("This post requires hostel residence")
      }
      const allowedHostelNames = normalizeStringArray(post.requirements?.allowedHostelNames)
      if (allowedHostelNames.length > 0 && !allowedHostelNames.includes(hostelName)) {
        return forbidden("You are not eligible for this hostel-specific post")
      }
    }

    if (
      post.requirements?.requireElectorateMembership &&
      !doesProfileMatchScope(studentProfile, post.voterEligibility)
    ) {
      return forbidden("Only members of the electorate can contest this post")
    }

    if (Number(payload.cgpa) < Number(post.requirements?.minCgpa || 0)) {
      return forbidden(`Minimum CGPA ${post.requirements?.minCgpa} is required`)
    }

    const isPgStudent = !String(studentProfile.degree || "").toLowerCase().includes("b.tech") &&
      !String(studentProfile.degree || "").toLowerCase().includes("btech") &&
      !String(studentProfile.degree || "").toLowerCase().includes("ug")

    const completedSemesters = Number(payload.completedSemesters || 0)
    const remainingSemesters = Number(payload.remainingSemesters || 0)
    const minCompleted = isPgStudent
      ? Number(post.requirements?.minCompletedSemestersPg || 0)
      : Number(post.requirements?.minCompletedSemestersUg || 0)

    if (completedSemesters < minCompleted) {
      return forbidden(`At least ${minCompleted} completed semesters are required`)
    }
    if (remainingSemesters < Number(post.requirements?.minRemainingSemesters || 0)) {
      return forbidden(
        `At least ${post.requirements?.minRemainingSemesters} remaining semesters are required`
      )
    }

    const activeOtherNomination = await ElectionNomination.findOne({
      electionId: election._id,
      candidateUserId: user._id,
      status: {
        $in: [
          NOMINATION_STATUS.SUBMITTED,
          NOMINATION_STATUS.MODIFICATION_REQUESTED,
          NOMINATION_STATUS.VERIFIED,
        ],
      },
      postId: {
        $ne: post._id,
      },
    })
    if (activeOtherNomination) {
      return forbidden("You cannot contest for more than one post concurrently")
    }

    const proposerRollNumbers = normalizeRollNumbers(payload.proposerRollNumbers)
    const seconderRollNumbers = normalizeRollNumbers(payload.seconderRollNumbers)

    const supporterOverlap = proposerRollNumbers.filter((rollNumber) => seconderRollNumbers.includes(rollNumber))
    if (supporterOverlap.length > 0) {
      return badRequest(`Supporters cannot both propose and second: ${supporterOverlap.join(", ")}`)
    }

    const supporterRollNumbers = normalizeRollNumbers([...proposerRollNumbers, ...seconderRollNumbers])
    if (supporterRollNumbers.includes(String(studentProfile.rollNumber || "").toUpperCase())) {
      return badRequest("Candidate cannot propose or second themselves")
    }

    if (proposerRollNumbers.length < Number(post.requirements?.proposersRequired || 0)) {
      return badRequest(`At least ${post.requirements?.proposersRequired} proposers are required`)
    }
    if (seconderRollNumbers.length < Number(post.requirements?.secondersRequired || 0)) {
      return badRequest(`At least ${post.requirements?.secondersRequired} seconders are required`)
    }

    const supportersResult = await validateRollNumberUsersExist(supporterRollNumbers, "supporter roll numbers")
    if (!supportersResult.success) return supportersResult

    const supporterProfiles = supportersResult.data.profiles
    const supporterUserIds = supporterProfiles.map((profile) => profile.userId?._id).filter(Boolean)

    const invalidElectorateSupporters = supporterProfiles.filter((profile) => !doesProfileMatchScope(profile, post.voterEligibility))
    if (invalidElectorateSupporters.length > 0) {
      return forbidden("All proposers and seconders must belong to the electorate for the post")
    }

    const commissionSupporters = supporterProfiles.filter((profile) =>
      commissionRollNumbers.has(String(profile.rollNumber || "").toUpperCase())
    )
    if (commissionSupporters.length > 0) {
      return forbidden("Election commission members cannot propose or second candidates")
    }

    const candidateSupporterConflict = await ElectionNomination.findOne({
      electionId: election._id,
      candidateUserId: { $in: supporterUserIds },
      status: {
        $in: [
          NOMINATION_STATUS.SUBMITTED,
          NOMINATION_STATUS.MODIFICATION_REQUESTED,
          NOMINATION_STATUS.VERIFIED,
        ],
      },
    })
    if (candidateSupporterConflict) {
      return forbidden("Candidates contesting in this election cannot propose or second another candidate")
    }

    let nomination = await ElectionNomination.findOne({
      electionId: election._id,
      postId: post._id,
      candidateUserId: user._id,
    })

    const conflictingSupporterAssignment = await ElectionNomination.findOne({
      electionId: election._id,
      postId: post._id,
      _id: nomination?._id ? { $ne: nomination._id } : { $exists: true },
      status: {
        $in: [
          NOMINATION_STATUS.SUBMITTED,
          NOMINATION_STATUS.MODIFICATION_REQUESTED,
          NOMINATION_STATUS.VERIFIED,
        ],
      },
      $or: [
        { proposerUserIds: { $in: supporterUserIds } },
        { seconderUserIds: { $in: supporterUserIds } },
      ],
    })
    if (conflictingSupporterAssignment) {
      return forbidden("A proposer or seconder has already supported another candidate for this post")
    }

    const proposerUserIds = supporterProfiles
      .filter((profile) => proposerRollNumbers.includes(String(profile.rollNumber).toUpperCase()))
      .map((profile) => profile.userId._id)

    const seconderUserIds = supporterProfiles
      .filter((profile) => seconderRollNumbers.includes(String(profile.rollNumber).toUpperCase()))
      .map((profile) => profile.userId._id)

    const nominationPayload = {
      electionId: election._id,
      postId: post._id,
      postTitle: post.title,
      candidateUserId: user._id,
      candidateProfileId: studentProfile._id,
      candidateRollNumber: studentProfile.rollNumber,
      candidateBatch: studentProfile.batch || "",
      pitch: String(payload.pitch || "").trim(),
      agendaPoints: normalizeStringArray(payload.agendaPoints),
      cgpa: Number(payload.cgpa),
      completedSemesters,
      remainingSemesters,
      proposerUserIds,
      seconderUserIds,
      proposerRollNumbers,
      seconderRollNumbers,
      gradeCardUrl: String(payload.gradeCardUrl || "").trim(),
      manifestoUrl: String(payload.manifestoUrl || "").trim(),
      porDocumentUrl: String(payload.porDocumentUrl || "").trim(),
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      status: NOMINATION_STATUS.SUBMITTED,
      review: {
        reviewedBy: null,
        reviewedAt: null,
        notes: "",
      },
      withdrawnAt: null,
    }

    if (!nomination) {
      nomination = await ElectionNomination.create(nominationPayload)
    } else {
      Object.assign(nomination, nominationPayload)
      await nomination.save()
    }

    await nomination.populate({ path: "candidateUserId", select: "name email" })
    await nomination.populate({ path: "candidateProfileId", select: "idCard" })

    return success(
      serializeNomination(nomination),
      200,
      "Nomination saved successfully"
    )
  }

  async withdrawNomination(electionId, nominationId, user) {
    const election = await Election.findById(electionId)
    if (!election) return notFound("Election")

    const stage = getCurrentStage(election)
    if (![ELECTION_STAGE.NOMINATION, ELECTION_STAGE.WITHDRAWAL].includes(stage)) {
      return forbidden("Withdrawal is not available for this election right now")
    }

    const nomination = await ElectionNomination.findOne({
      _id: nominationId,
      electionId: election._id,
      candidateUserId: user._id,
    })
      .populate({ path: "candidateUserId", select: "name email" })
      .populate({ path: "candidateProfileId", select: "idCard" })

    if (!nomination) return notFound("Nomination")

    nomination.status = NOMINATION_STATUS.WITHDRAWN
    nomination.withdrawnAt = new Date()
    await nomination.save()

    return success(
      serializeNomination(nomination),
      200,
      "Nomination withdrawn successfully"
    )
  }

  async reviewNomination(electionId, nominationId, payload, user) {
    const election = await Election.findById(electionId)
    if (!election) return notFound("Election")

    const nomination = await ElectionNomination.findOne({
      _id: nominationId,
      electionId: election._id,
    })
      .populate({ path: "candidateUserId", select: "name email" })
      .populate({ path: "candidateProfileId", select: "idCard" })

    if (!nomination) return notFound("Nomination")

    nomination.status = payload.status
    nomination.review = {
      reviewedBy: user._id,
      reviewedAt: new Date(),
      notes: String(payload.notes || "").trim(),
    }
    await nomination.save()

    return success(
      serializeNomination(nomination),
      200,
      "Nomination reviewed successfully"
    )
  }

  async castVote(electionId, postId, payload, user) {
    const election = await Election.findById(electionId)
    if (!election) return notFound("Election")

    const stage = getCurrentStage(election)
    if (stage !== ELECTION_STAGE.VOTING) {
      return forbidden("Voting is not open for this election right now")
    }

    const post = resolvePostById(election, postId)
    if (!post) return notFound("Election post")

    const studentProfile = await getStudentProfileWithRelations(user._id)
    if (!studentProfile) {
      return forbidden("Only active students can vote")
    }

    if (!doesProfileMatchScope(studentProfile, post.voterEligibility)) {
      return forbidden("You are not eligible to vote for this post")
    }

    const existingVote = await ElectionVote.findOne({
      electionId: election._id,
      postId: post._id,
      voterUserId: user._id,
    })
    if (existingVote) {
      return forbidden("You have already voted for this post")
    }

    const nomination = await ElectionNomination.findOne({
      _id: payload.candidateNominationId,
      electionId: election._id,
      postId: post._id,
      status: NOMINATION_STATUS.VERIFIED,
    })
    if (!nomination) {
      return badRequest("Selected candidate is not available for voting")
    }

    await ElectionVote.create({
      electionId: election._id,
      postId: post._id,
      voterUserId: user._id,
      voterRollNumber: studentProfile.rollNumber,
      candidateNominationId: nomination._id,
      candidateUserId: nomination.candidateUserId,
      candidateRollNumber: nomination.candidateRollNumber,
      castAt: new Date(),
    })

    return success(
      {
        postId: post._id,
        candidateNominationId: nomination._id,
      },
      200,
      "Vote cast successfully"
    )
  }

  async publishResults(electionId, payload, user) {
    const election = await Election.findById(electionId)
    if (!election) return notFound("Election")

    const computedResults = await buildElectionResults(election)
    const requestedPosts = new Map(
      (payload?.posts || []).map((item) => [String(item.postId), item])
    )

    const publicationPosts = []
    for (const postResult of computedResults.posts) {
      const requested = requestedPosts.get(String(postResult.postId)) || {}
      const winnerNominationId = requested.winnerNominationId
        ? String(requested.winnerNominationId)
        : postResult.previewWinnerNominationId

      if (
        winnerNominationId &&
        !postResult.candidates.some((candidate) => String(candidate.nominationId) === winnerNominationId)
      ) {
        return badRequest(`Selected winner is invalid for ${postResult.postTitle}`)
      }

      publicationPosts.push({
        postId: new mongoose.Types.ObjectId(String(postResult.postId)),
        winnerNominationId: winnerNominationId ? new mongoose.Types.ObjectId(winnerNominationId) : null,
        notes: String(requested.notes || "").trim(),
      })
    }

    election.resultPublication = {
      isPublished: true,
      publishedAt: new Date(),
      publishedBy: user._id,
      posts: publicationPosts,
    }
    election.updatedBy = user._id
    await election.save()

    return success(
      {
        results: await buildElectionResults(election),
      },
      200,
      "Results published successfully"
    )
  }
}

export const electionsService = new ElectionsService()
export default electionsService
