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
  NOMINATION_SUPPORTER_STATUS,
} from "./elections.constants.js"
import { emailService } from "../../../../services/email/email.service.js"
import {
  ACTION_LINK_TOKEN_TYPE,
  consumeActionLinkToken,
  createActionLinkToken,
  findActionLinkTokenByRawToken,
  invalidateActionLinkTokens,
  isActionLinkTokenExpired,
} from "../../../../services/action-links/action-link-token.service.js"
import { emitToRole } from "../../../../utils/socketHandlers.js"
import { triggerElectionVotingEmailDispatchForElection } from "./elections-voting-dispatch.service.js"

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

const ACTIVE_NOMINATION_STATUSES = [
  NOMINATION_STATUS.SUBMITTED,
  NOMINATION_STATUS.MODIFICATION_REQUESTED,
  NOMINATION_STATUS.VERIFIED,
]

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
      select: "name email role profileImage",
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

const doesProfileMatchSupporterScope = (profile, post) =>
  doesProfileMatchScope(profile, post?.voterEligibility) ||
  doesProfileMatchScope(profile, post?.candidateEligibility)

const serializeSupporter = (supporter = {}) => ({
  userId: supporter.userId?._id || supporter.userId || null,
  rollNumber: String(supporter.rollNumber || "").toUpperCase(),
  name: supporter.name || "",
  email: supporter.email || "",
  profileImage: supporter.profileImage || "",
  status: supporter.status || NOMINATION_SUPPORTER_STATUS.PENDING,
  invitedAt: supporter.invitedAt || null,
  respondedAt: supporter.respondedAt || null,
  responseNote: supporter.responseNote || "",
})

const buildSupporterStatusSummary = (nomination) => {
  const supporters = [
    ...(Array.isArray(nomination?.proposerEntries) ? nomination.proposerEntries : []),
    ...(Array.isArray(nomination?.seconderEntries) ? nomination.seconderEntries : []),
  ]

  return supporters.reduce(
    (acc, supporter) => {
      acc.total += 1
      const key = supporter?.status || NOMINATION_SUPPORTER_STATUS.PENDING
      if (typeof acc[key] !== "number") {
        acc[key] = 0
      }
      acc[key] += 1
      return acc
    },
    {
      total: 0,
      pending: 0,
      accepted: 0,
      rejected: 0,
    }
  )
}

const getSupporterStatusChecks = (nomination, post) => {
  const proposers = Array.isArray(nomination?.proposerEntries) ? nomination.proposerEntries : []
  const seconders = Array.isArray(nomination?.seconderEntries) ? nomination.seconderEntries : []
  const proposersRequired = Number(post?.requirements?.proposersRequired || 0)
  const secondersRequired = Number(post?.requirements?.secondersRequired || 0)

  const proposerAcceptedCount = proposers.filter(
    (supporter) => supporter?.status === NOMINATION_SUPPORTER_STATUS.ACCEPTED
  ).length
  const seconderAcceptedCount = seconders.filter(
    (supporter) => supporter?.status === NOMINATION_SUPPORTER_STATUS.ACCEPTED
  ).length

  const rejectedSupporters = [...proposers, ...seconders].filter(
    (supporter) => supporter?.status === NOMINATION_SUPPORTER_STATUS.REJECTED
  )
  const pendingSupporters = [...proposers, ...seconders].filter(
    (supporter) => supporter?.status === NOMINATION_SUPPORTER_STATUS.PENDING
  )

  return {
    proposersRequired,
    secondersRequired,
    proposerAcceptedCount,
    seconderAcceptedCount,
    rejectedSupporters,
    pendingSupporters,
    allAccepted:
      proposerAcceptedCount >= proposersRequired &&
      seconderAcceptedCount >= secondersRequired &&
      rejectedSupporters.length === 0 &&
      pendingSupporters.length === 0,
  }
}

const getNominationSupporterEntries = (nomination, supportType) => {
  if (supportType === "proposer") {
    return Array.isArray(nomination?.proposerEntries) ? nomination.proposerEntries : []
  }
  return Array.isArray(nomination?.seconderEntries) ? nomination.seconderEntries : []
}

const getNominationSupporterEntry = (nomination, supportType, rollNumber) => {
  const normalizedRollNumber = String(rollNumber || "").trim().toUpperCase()
  return getNominationSupporterEntries(nomination, supportType).find(
    (entry) => String(entry?.rollNumber || "").trim().toUpperCase() === normalizedRollNumber
  ) || null
}

const getSupporterConfirmationExpiry = (election) => {
  const withdrawalEndAt = toDate(election?.timeline?.withdrawalEndAt)
  const nominationEndAt = toDate(election?.timeline?.nominationEndAt)
  const fallback = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const preferred = withdrawalEndAt || nominationEndAt || fallback
  return preferred.getTime() > Date.now() ? preferred : fallback
}

const buildSupporterLinkPayload = ({
  electionId,
  postId,
  supportType,
  supporterRollNumber,
}) => ({
  electionId: String(electionId || ""),
  postId: String(postId || ""),
  supportType,
  supporterRollNumber: String(supporterRollNumber || "").trim().toUpperCase(),
})

const areSupporterPayloadsEqual = (left = {}, right = {}) =>
  String(left?.electionId || "") === String(right?.electionId || "") &&
  String(left?.postId || "") === String(right?.postId || "") &&
  String(left?.supportType || "") === String(right?.supportType || "") &&
  String(left?.supporterRollNumber || "") === String(right?.supporterRollNumber || "")

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
      select: "name email role profileImage",
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
  candidateProfileImage: nomination.candidateUserId?.profileImage || "",
  candidateRollNumber: nomination.candidateRollNumber,
  candidateBatch: nomination.candidateBatch || "",
  pitch: nomination.pitch || "",
  agendaPoints: Array.isArray(nomination.agendaPoints) ? nomination.agendaPoints : [],
  cgpa: nomination.cgpa,
  completedSemesters: nomination.completedSemesters,
  remainingSemesters: nomination.remainingSemesters,
  proposerRollNumbers: nomination.proposerRollNumbers || [],
  seconderRollNumbers: nomination.seconderRollNumbers || [],
  proposerEntries: (nomination.proposerEntries || []).map(serializeSupporter),
  seconderEntries: (nomination.seconderEntries || []).map(serializeSupporter),
  supporterSummary: buildSupporterStatusSummary(nomination),
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
  votingEmailDispatch: {
    dispatchKey: election.votingEmailDispatch?.dispatchKey || "",
    status: election.votingEmailDispatch?.status || "idle",
    startedAt: election.votingEmailDispatch?.startedAt || null,
    completedAt: election.votingEmailDispatch?.completedAt || null,
    lastTriggeredAt: election.votingEmailDispatch?.lastTriggeredAt || null,
    totalRecipients: Number(election.votingEmailDispatch?.totalRecipients || 0),
    sentRecipients: Number(election.votingEmailDispatch?.sentRecipients || 0),
    failedRecipients: Number(election.votingEmailDispatch?.failedRecipients || 0),
    lastError: election.votingEmailDispatch?.lastError || "",
  },
  createdAt: election.createdAt,
  updatedAt: election.updatedAt,
})

const buildStudentScopeQuery = (scope = {}) => {
  const batches = normalizeStringArray(scope?.batches)
  const extraRollNumbers = normalizeRollNumbers(scope?.extraRollNumbers)

  if (batches.length === 0 && extraRollNumbers.length === 0) {
    return null
  }

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

  return query
}

const buildElectionVotingLiveStats = async (election) => {
  const electionId = new mongoose.Types.ObjectId(String(election._id))

  const [verifiedNominationCounts, voteCounts, distinctVoterIds] = await Promise.all([
    ElectionNomination.aggregate([
      {
        $match: {
          electionId,
          status: NOMINATION_STATUS.VERIFIED,
        },
      },
      {
        $group: {
          _id: "$postId",
          count: { $sum: 1 },
        },
      },
    ]),
    ElectionVote.aggregate([
      {
        $match: {
          electionId,
        },
      },
      {
        $group: {
          _id: "$postId",
          count: { $sum: 1 },
          lastCastAt: { $max: "$castAt" },
        },
      },
    ]),
    ElectionVote.distinct("voterUserId", { electionId: election._id }),
  ])

  const verifiedNominationCountMap = new Map(
    verifiedNominationCounts.map((item) => [String(item._id), Number(item.count || 0)])
  )
  const voteCountMap = new Map(
    voteCounts.map((item) => [
      String(item._id),
      {
        count: Number(item.count || 0),
        lastCastAt: item.lastCastAt || null,
      },
    ])
  )

  const overallEligibleVoterIds = new Set()
  const posts = await Promise.all(
    (election?.posts || []).map(async (post) => {
      const postId = String(post._id)
      const electorateQuery = buildStudentScopeQuery(post?.voterEligibility)
      const eligibleVoterIds = electorateQuery
        ? (await StudentProfile.distinct("userId", electorateQuery)).map((value) => String(value))
        : []
      const eligibleVoterCount = eligibleVoterIds.length
      const verifiedCandidateCount = verifiedNominationCountMap.get(postId) || 0
      const postVoteData = voteCountMap.get(postId) || { count: 0, lastCastAt: null }
      const votedCount = postVoteData.count
      const pendingCount = Math.max(eligibleVoterCount - votedCount, 0)

      if (verifiedCandidateCount > 0) {
        eligibleVoterIds.forEach((userId) => overallEligibleVoterIds.add(userId))
      }

      return {
        postId,
        postTitle: post.title,
        verifiedCandidateCount,
        eligibleVoterCount,
        votedCount,
        pendingCount,
        turnoutPercentage:
          eligibleVoterCount > 0
            ? Number(((votedCount / eligibleVoterCount) * 100).toFixed(1))
            : 0,
        lastCastAt: postVoteData.lastCastAt,
      }
    })
  )

  const ballotsSubmitted = distinctVoterIds.length
  const totalEligibleVoters = overallEligibleVoterIds.size
  const ballotsPending = Math.max(totalEligibleVoters - ballotsSubmitted, 0)

  return {
    electionId: String(election._id),
    generatedAt: new Date(),
    dispatch: {
      dispatchKey: election.votingEmailDispatch?.dispatchKey || "",
      status: election.votingEmailDispatch?.status || "idle",
      startedAt: election.votingEmailDispatch?.startedAt || null,
      completedAt: election.votingEmailDispatch?.completedAt || null,
      lastTriggeredAt: election.votingEmailDispatch?.lastTriggeredAt || null,
      totalRecipients: Number(election.votingEmailDispatch?.totalRecipients || 0),
      sentRecipients: Number(election.votingEmailDispatch?.sentRecipients || 0),
      failedRecipients: Number(election.votingEmailDispatch?.failedRecipients || 0),
      lastError: election.votingEmailDispatch?.lastError || "",
    },
    overview: {
      totalEligibleVoters,
      ballotsSubmitted,
      ballotsPending,
      turnoutPercentage:
        totalEligibleVoters > 0
          ? Number(((ballotsSubmitted / totalEligibleVoters) * 100).toFixed(1))
          : 0,
      totalVotesCast: posts.reduce((sum, post) => sum + Number(post.votedCount || 0), 0),
      activePostCount: posts.filter((post) => post.verifiedCandidateCount > 0).length,
    },
    posts,
  }
}

const emitElectionVotingLiveUpdate = async (election) => {
  if (!election?._id) return

  const stats = await buildElectionVotingLiveStats(election)
  const payload = {
    electionId: String(election._id),
    stats,
  }

  emitToRole(ROLES.ADMIN, "election:voting-live:update", payload)
  emitToRole(ROLES.SUPER_ADMIN, "election:voting-live:update", payload)
}

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
  }).populate({ path: "candidateUserId", select: "name email profileImage" })

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

const buildSupporterEntriesForRole = ({
  existingEntries = [],
  rollNumbers = [],
  supporterProfiles = [],
}) => {
  const existingEntryMap = new Map(
    existingEntries.map((entry) => [String(entry?.rollNumber || "").trim().toUpperCase(), entry])
  )
  const profileMap = new Map(
    supporterProfiles.map((profile) => [String(profile.rollNumber || "").trim().toUpperCase(), profile])
  )

  const notifications = []
  const entries = rollNumbers.map((rollNumber) => {
    const normalizedRollNumber = String(rollNumber || "").trim().toUpperCase()
    const existingEntry = existingEntryMap.get(normalizedRollNumber)
    const profile = profileMap.get(normalizedRollNumber)

    const nextEntry = {
      userId: profile?.userId?._id || null,
      rollNumber: normalizedRollNumber,
      name: profile?.userId?.name || "",
      email: profile?.userId?.email || "",
      profileImage: profile?.userId?.profileImage || "",
      status: NOMINATION_SUPPORTER_STATUS.PENDING,
      invitedAt: null,
      respondedAt: null,
      responseNote: "",
    }

    if (existingEntry?.status === NOMINATION_SUPPORTER_STATUS.ACCEPTED) {
      nextEntry.status = NOMINATION_SUPPORTER_STATUS.ACCEPTED
      nextEntry.invitedAt = existingEntry.invitedAt || null
      nextEntry.respondedAt = existingEntry.respondedAt || null
      nextEntry.responseNote = existingEntry.responseNote || ""
      return nextEntry
    }

    if (existingEntry?.status === NOMINATION_SUPPORTER_STATUS.PENDING) {
      nextEntry.status = NOMINATION_SUPPORTER_STATUS.PENDING
      nextEntry.invitedAt = existingEntry.invitedAt || null
      if (!existingEntry.invitedAt) {
        notifications.push({
          rollNumber: normalizedRollNumber,
          userId: nextEntry.userId,
          email: nextEntry.email,
          name: nextEntry.name,
          profileImage: nextEntry.profileImage,
          previousStatus: existingEntry?.status || "",
        })
      }
      return nextEntry
    }

    notifications.push({
      rollNumber: normalizedRollNumber,
      userId: nextEntry.userId,
      email: nextEntry.email,
      name: nextEntry.name,
      profileImage: nextEntry.profileImage,
      previousStatus: existingEntry?.status || "",
    })

    return nextEntry
  })

  return { entries, notifications }
}

const buildSupporterPayloadKey = (supportType, rollNumber) =>
  `${String(supportType || "")}:${String(rollNumber || "").trim().toUpperCase()}`

const buildSupporterPayloadMap = (entries = [], supportType = "") =>
  new Map(
    entries.map((entry) => {
      const payload = buildSupporterLinkPayload({
        supportType,
        supporterRollNumber: entry.rollNumber,
      })
      return [buildSupporterPayloadKey(supportType, entry.rollNumber), payload]
    })
  )

const sendNominationSupportRequests = async ({
  election,
  nomination,
  candidateName,
  candidateRollNumber,
  postTitle,
  supporters = [],
}) => {
  const failures = []
  const sentKeys = []

  for (const supporter of supporters) {
    if (!supporter?.email) {
      failures.push(`${supporter?.rollNumber || "Unknown supporter"} has no email address`)
      continue
    }

    try {
      const payload = buildSupporterLinkPayload({
        electionId: election?._id,
        postId: nomination?.postId,
        supportType: supporter.supportType,
        supporterRollNumber: supporter.rollNumber,
      })
      const { rawToken } = await createActionLinkToken({
        type: ACTION_LINK_TOKEN_TYPE.ELECTION_NOMINATION_SUPPORT,
        subjectModel: "ElectionNomination",
        subjectId: nomination._id,
        recipientUserId: supporter.userId || null,
        recipientEmail: supporter.email,
        payload,
        expiresAt: getSupporterConfirmationExpiry(election),
      })

      const emailResult = await emailService.sendElectionSupportConfirmationEmail({
        email: supporter.email,
        supporterName: supporter.name,
        candidateName,
        candidateRollNumber,
        electionTitle: election?.title || "Election",
        postTitle,
        supportRole: supporter.supportType === "proposer" ? "Proposer" : "Seconder",
        confirmationToken: rawToken,
      })
      if (!emailResult?.success) {
        await invalidateActionLinkTokens(
          {
            type: ACTION_LINK_TOKEN_TYPE.ELECTION_NOMINATION_SUPPORT,
            subjectModel: "ElectionNomination",
            subjectId: nomination._id,
            "payload.supportType": supporter.supportType,
            "payload.supporterRollNumber": String(supporter.rollNumber || "").trim().toUpperCase(),
          },
          "Support confirmation email delivery failed"
        )
        failures.push(
          `${supporter?.rollNumber || "Unknown supporter"}: ${emailResult?.error || "Failed to send confirmation email"}`
        )
        continue
      }

      sentKeys.push(buildSupporterPayloadKey(supporter.supportType, supporter.rollNumber))
    } catch (error) {
      failures.push(
        `${supporter?.rollNumber || "Unknown supporter"}: ${error?.message || "Failed to send confirmation email"}`
      )
    }
  }

  return { failures, sentKeys }
}

const serializeBallotCandidate = (nomination) => ({
  nominationId: String(nomination._id),
  candidateName: nomination.candidateUserId?.name || nomination.candidateRollNumber,
  candidateRollNumber: nomination.candidateRollNumber,
  candidateProfileImage: nomination.candidateUserId?.profileImage || "",
  pitch: nomination.pitch || "",
})

const buildElectionBallotPayload = async (election, voterUserId) => {
  const voterProfile = await getStudentProfileWithRelations(voterUserId)
  if (!voterProfile) {
    return forbidden("Only active students can access this ballot")
  }

  const eligiblePosts = (election?.posts || []).filter((post) =>
    doesProfileMatchScope(voterProfile, post.voterEligibility)
  )
  if (eligiblePosts.length === 0) {
    return forbidden("You are not eligible to vote in this election")
  }

  const verifiedNominations = await ElectionNomination.find({
    electionId: election._id,
    postId: { $in: eligiblePosts.map((post) => post._id) },
    status: NOMINATION_STATUS.VERIFIED,
  }).populate({ path: "candidateUserId", select: "name email profileImage" })

  const nominationsByPostId = verifiedNominations.reduce((acc, nomination) => {
    const postId = String(nomination.postId)
    if (!acc[postId]) acc[postId] = []
    acc[postId].push(serializeBallotCandidate(nomination))
    return acc
  }, {})

  const posts = eligiblePosts
    .map((post) => ({
      postId: String(post._id),
      postTitle: post.title,
      candidates: nominationsByPostId[String(post._id)] || [],
    }))
    .filter((post) => (post.candidates || []).length > 0)

  if (posts.length === 0) {
    return forbidden("No verified ballot options are available for you in this election")
  }

  return success({
    voter: {
      userId: String(voterProfile.userId?._id || voterUserId),
      name: voterProfile.userId?.name || "",
      email: voterProfile.userId?.email || "",
      rollNumber: voterProfile.rollNumber,
    },
    posts,
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
        .populate({ path: "candidateUserId", select: "name email profileImage" })
        .populate({ path: "candidateProfileId", select: "idCard" })
        .sort({ createdAt: -1 })

      response.nominations = nominations.map(serializeNomination)
    }

    return success(response)
  }

  async getVotingLiveStats(id) {
    const election = await Election.findById(id)
    if (!election) return notFound("Election")

    if (getCurrentStage(election) !== ELECTION_STAGE.VOTING) {
      return forbidden("Live voting data is only available while voting is in progress")
    }

    const stats = await buildElectionVotingLiveStats(election)
    return success(stats)
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

  async cloneElection(id, payload, user) {
    const sourceElection = await Election.findById(id)
    if (!sourceElection) return notFound("Election")

    if ([ELECTION_STATUS.CANCELLED, ELECTION_STATUS.COMPLETED].includes(sourceElection.status)) {
      return forbidden("Only active elections can be copied")
    }

    const votingStartAt = toDate(sourceElection?.timeline?.votingStartAt)
    if (!votingStartAt || new Date() >= votingStartAt) {
      return forbidden("Election can only be copied before voting starts")
    }

    const title = String(payload?.title || "").trim()
    if (!title) {
      return badRequest("Title is required to create a copied election")
    }

    const clonedElection = await Election.create({
      title,
      academicYear: sourceElection.academicYear,
      phase: sourceElection.phase,
      description: sourceElection.description || "",
      status: sourceElection.status,
      electionCommission: {
        chiefElectionOfficerRollNumber: sourceElection.electionCommission?.chiefElectionOfficerRollNumber || "",
        officerRollNumbers: normalizeRollNumbers(sourceElection.electionCommission?.officerRollNumbers),
      },
      timeline: {
        announcementAt: sourceElection.timeline?.announcementAt,
        nominationStartAt: sourceElection.timeline?.nominationStartAt,
        nominationEndAt: sourceElection.timeline?.nominationEndAt,
        withdrawalEndAt: sourceElection.timeline?.withdrawalEndAt,
        campaigningStartAt: sourceElection.timeline?.campaigningStartAt,
        campaigningEndAt: sourceElection.timeline?.campaigningEndAt,
        votingStartAt: sourceElection.timeline?.votingStartAt,
        votingEndAt: sourceElection.timeline?.votingEndAt,
        resultsAnnouncedAt: sourceElection.timeline?.resultsAnnouncedAt,
        handoverAt: sourceElection.timeline?.handoverAt || null,
      },
      posts: (sourceElection.posts || []).map((post) => ({
        title: post.title,
        code: post.code || "",
        category: post.category,
        description: post.description || "",
        candidateEligibility: {
          batches: normalizeStringArray(post.candidateEligibility?.batches),
          extraRollNumbers: normalizeRollNumbers(post.candidateEligibility?.extraRollNumbers),
        },
        voterEligibility: {
          batches: normalizeStringArray(post.voterEligibility?.batches),
          extraRollNumbers: normalizeRollNumbers(post.voterEligibility?.extraRollNumbers),
        },
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
      })),
      createdBy: user._id,
      updatedBy: user._id,
    })

    return created(serializeElectionBase(clonedElection), "Election copied successfully")
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

  async sendVotingEmails(id) {
    const election = await Election.findById(id)
    if (!election) return notFound("Election")

    if (getCurrentStage(election) !== ELECTION_STAGE.VOTING) {
      return forbidden("Voting emails can only be sent while voting is in progress")
    }

    const votingStartAt = toDate(election?.timeline?.votingStartAt)
    if (!votingStartAt) {
      return badRequest("Voting start time is not configured correctly")
    }

    const dispatchKey = votingStartAt.toISOString()
    const existingDispatchKey = String(election?.votingEmailDispatch?.dispatchKey || "")
    const existingStatus = String(election?.votingEmailDispatch?.status || "idle")

    if (existingDispatchKey === dispatchKey && existingStatus === "running") {
      return badRequest("Voting emails are already being sent")
    }

    triggerElectionVotingEmailDispatchForElection(election._id, "manual").catch((error) => {
      console.error("Manual election voting email dispatch failed:", error?.message || error)
    })

    return success(
      {
        queued: true,
      },
      200,
      "Voting emails have been queued"
    )
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
        .populate({ path: "candidateUserId", select: "name email profileImage" })
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
        .populate({ path: "candidateUserId", select: "name email profileImage" })
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

  async lookupNominationSupporter(electionId, postId, query, user) {
    const election = await Election.findById(electionId)
    if (!election) return notFound("Election")

    const stage = getCurrentStage(election)
    if (![ELECTION_STAGE.NOMINATION, ELECTION_STAGE.WITHDRAWAL].includes(stage)) {
      return forbidden("Supporter lookup is only available while nominations are active")
    }

    const post = resolvePostById(election, postId)
    if (!post) return notFound("Election post")

    const studentProfile = await getStudentProfileWithRelations(user._id)
    if (!studentProfile) {
      return forbidden("Only active students can nominate for elections")
    }

    const rollNumber = String(query?.rollNumber || "").trim().toUpperCase()
    if (!rollNumber) {
      return badRequest("Supporter roll number is required")
    }

    if (rollNumber === String(studentProfile.rollNumber || "").trim().toUpperCase()) {
      return badRequest("Candidate cannot propose or second themselves")
    }

    let nomination = null
    if (query?.nominationId) {
      nomination = await ElectionNomination.findOne({
        _id: query.nominationId,
        electionId: election._id,
        postId: post._id,
        candidateUserId: user._id,
      })
    } else {
      nomination = await ElectionNomination.findOne({
        electionId: election._id,
        postId: post._id,
        candidateUserId: user._id,
      })
    }

    const lookupResult = await validateRollNumberUsersExist([rollNumber], "supporter roll number")
    if (!lookupResult.success) return lookupResult

    const supporterProfile = lookupResult.data.profiles[0]
    const supporterUserId = supporterProfile?.userId?._id || null
    const commissionRollNumbers = buildCommissionRollNumberSet(election)
    if (commissionRollNumbers.has(rollNumber)) {
      return forbidden("Election commission members cannot propose or second candidates")
    }

    if (!doesProfileMatchSupporterScope(supporterProfile, post)) {
      return forbidden("This student is not eligible to support this nomination")
    }

    const activeCandidateNomination = await ElectionNomination.findOne({
      electionId: election._id,
      candidateUserId: supporterUserId,
      status: { $in: ACTIVE_NOMINATION_STATUSES },
    })
    if (activeCandidateNomination) {
      return forbidden("Candidates contesting in this election cannot propose or second another candidate")
    }

    const conflictingSupporterAssignment = await ElectionNomination.findOne({
      electionId: election._id,
      postId: post._id,
      _id: nomination?._id ? { $ne: nomination._id } : { $exists: true },
      status: { $in: ACTIVE_NOMINATION_STATUSES },
      $or: [
        { proposerUserIds: { $in: [supporterUserId] } },
        { seconderUserIds: { $in: [supporterUserId] } },
      ],
    })
    if (conflictingSupporterAssignment) {
      return forbidden("This student has already supported another candidate for this post")
    }

    const currentRoleEntry =
      getNominationSupporterEntry(nomination, query?.supportType, rollNumber) ||
      getNominationSupporterEntry(
        nomination,
        query?.supportType === "proposer" ? "seconder" : "proposer",
        rollNumber
      )

    return success({
      rollNumber,
      userId: supporterUserId,
      name: supporterProfile?.userId?.name || "",
      email: supporterProfile?.userId?.email || "",
      profileImage: supporterProfile?.userId?.profileImage || "",
      candidatePoolEligible: doesProfileMatchScope(supporterProfile, post.candidateEligibility),
      voterPoolEligible: doesProfileMatchScope(supporterProfile, post.voterEligibility),
      currentStatus: currentRoleEntry?.status || "",
      currentRole:
        getNominationSupporterEntry(nomination, "proposer", rollNumber)
          ? "proposer"
          : getNominationSupporterEntry(nomination, "seconder", rollNumber)
            ? "seconder"
            : "",
    })
  }

  async getSupporterConfirmationByToken(token) {
    const tokenDoc = await findActionLinkTokenByRawToken(token, {
      type: ACTION_LINK_TOKEN_TYPE.ELECTION_NOMINATION_SUPPORT,
      includeUsed: true,
      includeInvalidated: true,
    })
    if (!tokenDoc) {
      return notFound("Invalid confirmation link")
    }

    const nomination = await ElectionNomination.findById(tokenDoc.subjectId)
      .populate({ path: "candidateUserId", select: "name email profileImage" })
      .populate({ path: "candidateProfileId", select: "idCard" })
    if (!nomination) {
      return notFound("Nomination")
    }
    if (!ACTIVE_NOMINATION_STATUSES.includes(nomination.status)) {
      return badRequest("This nomination is no longer accepting supporter confirmations")
    }

    const election = await Election.findById(nomination.electionId)
    if (!election) {
      return notFound("Election")
    }

    const supportType = tokenDoc?.payload?.supportType === "seconder" ? "seconder" : "proposer"
    const supporterRollNumber = String(tokenDoc?.payload?.supporterRollNumber || "").trim().toUpperCase()
    const supporterEntry = getNominationSupporterEntry(nomination, supportType, supporterRollNumber)
    if (!supporterEntry) {
      return badRequest("This supporter request is no longer active")
    }

    return success({
      tokenState: tokenDoc.invalidatedAt
        ? "invalidated"
        : tokenDoc.usedAt
          ? "used"
          : isActionLinkTokenExpired(tokenDoc)
            ? "expired"
            : "active",
      tokenUsedAt: tokenDoc.usedAt || null,
      tokenExpiresAt: tokenDoc.expiresAt || null,
      election: {
        id: election._id,
        title: election.title,
        academicYear: election.academicYear,
      },
      nomination: {
        id: nomination._id,
        postId: nomination.postId,
        postTitle: nomination.postTitle,
        candidateName: nomination.candidateUserId?.name || "",
        candidateEmail: nomination.candidateUserId?.email || "",
        candidateProfileImage: nomination.candidateUserId?.profileImage || "",
        candidateRollNumber: nomination.candidateRollNumber,
        supportType,
        supporter: serializeSupporter(supporterEntry),
      },
    })
  }

  async respondToSupporterConfirmation(token, payload) {
    const tokenDoc = await findActionLinkTokenByRawToken(token, {
      type: ACTION_LINK_TOKEN_TYPE.ELECTION_NOMINATION_SUPPORT,
    })
    if (!tokenDoc) {
      return notFound("Invalid confirmation link")
    }

    if (isActionLinkTokenExpired(tokenDoc)) {
      return badRequest("This confirmation link has expired")
    }

    const nomination = await ElectionNomination.findById(tokenDoc.subjectId)
      .populate({ path: "candidateUserId", select: "name email profileImage" })
      .populate({ path: "candidateProfileId", select: "idCard" })
    if (!nomination) {
      return notFound("Nomination")
    }

    const supportType = tokenDoc?.payload?.supportType === "seconder" ? "seconder" : "proposer"
    const supporterRollNumber = String(tokenDoc?.payload?.supporterRollNumber || "").trim().toUpperCase()
    const targetEntriesKey = supportType === "proposer" ? "proposerEntries" : "seconderEntries"
    const targetEntries = Array.isArray(nomination[targetEntriesKey]) ? nomination[targetEntriesKey] : []
    const supporterIndex = targetEntries.findIndex(
      (entry) => String(entry?.rollNumber || "").trim().toUpperCase() === supporterRollNumber
    )
    if (supporterIndex === -1) {
      return badRequest("This supporter request is no longer active")
    }
    if (targetEntries[supporterIndex]?.status !== NOMINATION_SUPPORTER_STATUS.PENDING) {
      return badRequest("This supporter request has already been processed")
    }

    targetEntries[supporterIndex].status =
      payload?.decision === "accepted"
        ? NOMINATION_SUPPORTER_STATUS.ACCEPTED
        : NOMINATION_SUPPORTER_STATUS.REJECTED
    targetEntries[supporterIndex].respondedAt = new Date()
    targetEntries[supporterIndex].responseNote = ""
    nomination[targetEntriesKey] = targetEntries
    await nomination.save()

    await consumeActionLinkToken(tokenDoc, {
      decision: payload?.decision,
      supportType,
      supporterRollNumber,
    })
    await invalidateActionLinkTokens(
      {
        type: ACTION_LINK_TOKEN_TYPE.ELECTION_NOMINATION_SUPPORT,
        subjectModel: "ElectionNomination",
        subjectId: nomination._id,
        _id: { $ne: tokenDoc._id },
        "payload.supportType": supportType,
        "payload.supporterRollNumber": supporterRollNumber,
      },
      "Supporter has already responded"
    )

    return success(
      {
        nomination: serializeNomination(nomination),
      },
      200,
      payload?.decision === "accepted"
        ? "You have accepted this nomination support request"
        : "You have rejected this nomination support request"
    )
  }

  async getBallotByToken(token) {
    const tokenDoc = await findActionLinkTokenByRawToken(token, {
      type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
      includeUsed: true,
      includeInvalidated: true,
    })
    if (!tokenDoc) {
      return notFound("Invalid ballot link")
    }

    const election = await Election.findById(tokenDoc.subjectId)
    if (!election) {
      return notFound("Election")
    }

    const existingVote = await ElectionVote.findOne({
      electionId: election._id,
      voterUserId: tokenDoc.recipientUserId,
    })

    const ballotResult = await buildElectionBallotPayload(election, tokenDoc.recipientUserId)
    if (!ballotResult.success) return ballotResult

    const stage = getCurrentStage(election)
    const tokenState = tokenDoc.invalidatedAt
      ? "invalidated"
      : tokenDoc.usedAt || existingVote
        ? "used"
        : isActionLinkTokenExpired(tokenDoc)
          ? "expired"
          : stage !== ELECTION_STAGE.VOTING
            ? "inactive"
            : "active"

    return success({
      tokenState,
      tokenUsedAt: tokenDoc.usedAt || existingVote?.castAt || null,
      tokenExpiresAt: tokenDoc.expiresAt || null,
      election: {
        id: election._id,
        title: election.title,
        academicYear: election.academicYear,
        votingStartAt: election.timeline?.votingStartAt || null,
        votingEndAt: election.timeline?.votingEndAt || null,
      },
      voter: ballotResult.data.voter,
      posts: ballotResult.data.posts,
    })
  }

  async submitBallotByToken(token, payload) {
    const tokenDoc = await findActionLinkTokenByRawToken(token, {
      type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
    })
    if (!tokenDoc) {
      return notFound("Invalid ballot link")
    }

    if (isActionLinkTokenExpired(tokenDoc)) {
      return badRequest("This ballot link has expired")
    }

    const election = await Election.findById(tokenDoc.subjectId)
    if (!election) {
      return notFound("Election")
    }

    if (getCurrentStage(election) !== ELECTION_STAGE.VOTING) {
      return forbidden("Voting is not open for this election right now")
    }

    const existingVote = await ElectionVote.findOne({
      electionId: election._id,
      voterUserId: tokenDoc.recipientUserId,
    })
    if (existingVote) {
      return badRequest("This ballot has already been submitted")
    }

    const ballotResult = await buildElectionBallotPayload(election, tokenDoc.recipientUserId)
    if (!ballotResult.success) return ballotResult

    const expectedPosts = ballotResult.data.posts || []
    const requestedVotes = Array.isArray(payload?.votes) ? payload.votes : []

    if (requestedVotes.length !== expectedPosts.length) {
      return badRequest("Select one candidate for every available post before submitting the ballot")
    }

    const voteByPostId = new Map()
    for (const vote of requestedVotes) {
      const postId = String(vote.postId)
      if (voteByPostId.has(postId)) {
        return badRequest("Only one candidate can be selected for each post")
      }
      voteByPostId.set(postId, String(vote.candidateNominationId))
    }

    const voteDocs = []
    for (const post of expectedPosts) {
      const selectedNominationId = voteByPostId.get(String(post.postId))
      if (!selectedNominationId) {
        return badRequest(`Choose a candidate for ${post.postTitle}`)
      }

      const selectedCandidate = (post.candidates || []).find(
        (candidate) => String(candidate.nominationId) === selectedNominationId
      )
      if (!selectedCandidate) {
        return badRequest(`Selected candidate is invalid for ${post.postTitle}`)
      }

      voteDocs.push({
        electionId: election._id,
        postId: new mongoose.Types.ObjectId(String(post.postId)),
        voterUserId: tokenDoc.recipientUserId,
        voterRollNumber: ballotResult.data.voter.rollNumber,
        candidateNominationId: new mongoose.Types.ObjectId(String(selectedCandidate.nominationId)),
        candidateUserId: null,
        candidateRollNumber: selectedCandidate.candidateRollNumber,
        castAt: new Date(),
      })
    }

    const verifiedNominations = await ElectionNomination.find({
      _id: { $in: voteDocs.map((vote) => vote.candidateNominationId) },
      electionId: election._id,
      status: NOMINATION_STATUS.VERIFIED,
    }).select("_id candidateUserId")
    const candidateUserIdMap = new Map(
      verifiedNominations.map((nomination) => [String(nomination._id), nomination.candidateUserId])
    )

    for (const voteDoc of voteDocs) {
      const candidateUserId = candidateUserIdMap.get(String(voteDoc.candidateNominationId))
      if (!candidateUserId) {
        return badRequest("One or more selected candidates are no longer available")
      }
      voteDoc.candidateUserId = candidateUserId
    }

    await ElectionVote.insertMany(voteDocs)
    await consumeActionLinkToken(tokenDoc, {
      voteCount: voteDocs.length,
      electionId: String(election._id),
    })
    await invalidateActionLinkTokens(
      {
        type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
        subjectModel: "Election",
        subjectId: election._id,
        recipientUserId: tokenDoc.recipientUserId,
        _id: { $ne: tokenDoc._id },
      },
      "Ballot already submitted"
    )

    emitElectionVotingLiveUpdate(election).catch((error) => {
      console.error("Failed to emit election voting live update:", error?.message || error)
    })

    return success(
      {
        electionId: election._id,
        submittedPosts: voteDocs.length,
      },
      200,
      "Ballot submitted successfully"
    )
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
      status: { $in: ACTIVE_NOMINATION_STATUSES },
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

    const invalidElectorateSupporters = supporterProfiles.filter(
      (profile) => !doesProfileMatchSupporterScope(profile, post)
    )
    if (invalidElectorateSupporters.length > 0) {
      return forbidden("All proposers and seconders must belong to the candidate or voter pool for the post")
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
      status: { $in: ACTIVE_NOMINATION_STATUSES },
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
      status: { $in: ACTIVE_NOMINATION_STATUSES },
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

    const proposerBuild = buildSupporterEntriesForRole({
      existingEntries: nomination?.proposerEntries || [],
      rollNumbers: proposerRollNumbers,
      supporterProfiles,
    })
    const seconderBuild = buildSupporterEntriesForRole({
      existingEntries: nomination?.seconderEntries || [],
      rollNumbers: seconderRollNumbers,
      supporterProfiles,
    })

    const previousSupporterPayloads = nomination
      ? [
          ...(nomination.proposerEntries || []).map((entry) => ({
            key: buildSupporterPayloadKey("proposer", entry.rollNumber),
            payload: buildSupporterLinkPayload({
              electionId: election._id,
              postId: post._id,
              supportType: "proposer",
              supporterRollNumber: entry.rollNumber,
            }),
          })),
          ...(nomination.seconderEntries || []).map((entry) => ({
            key: buildSupporterPayloadKey("seconder", entry.rollNumber),
            payload: buildSupporterLinkPayload({
              electionId: election._id,
              postId: post._id,
              supportType: "seconder",
              supporterRollNumber: entry.rollNumber,
            }),
          })),
        ]
      : []

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
      proposerEntries: proposerBuild.entries,
      seconderEntries: seconderBuild.entries,
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

    const currentSupporterPayloadMap = new Map([
      ...[...(nomination.proposerEntries || [])].map((entry) => [
        buildSupporterPayloadKey("proposer", entry.rollNumber),
        buildSupporterLinkPayload({
          electionId: election._id,
          postId: post._id,
          supportType: "proposer",
          supporterRollNumber: entry.rollNumber,
        }),
      ]),
      ...[...(nomination.seconderEntries || [])].map((entry) => [
        buildSupporterPayloadKey("seconder", entry.rollNumber),
        buildSupporterLinkPayload({
          electionId: election._id,
          postId: post._id,
          supportType: "seconder",
          supporterRollNumber: entry.rollNumber,
        }),
      ]),
    ])

    for (const previousEntry of previousSupporterPayloads) {
      if (!currentSupporterPayloadMap.has(previousEntry.key)) {
        await invalidateActionLinkTokens(
          {
            type: ACTION_LINK_TOKEN_TYPE.ELECTION_NOMINATION_SUPPORT,
            subjectModel: "ElectionNomination",
            subjectId: nomination._id,
            "payload.supportType": previousEntry.payload.supportType,
            "payload.supporterRollNumber": previousEntry.payload.supporterRollNumber,
          },
          "Supporter removed from nomination"
        )
      }
    }

    const supportersToNotify = [
      ...proposerBuild.notifications.map((entry) => ({ ...entry, supportType: "proposer" })),
      ...seconderBuild.notifications.map((entry) => ({ ...entry, supportType: "seconder" })),
    ]

    for (const supporter of supportersToNotify) {
      await invalidateActionLinkTokens(
        {
          type: ACTION_LINK_TOKEN_TYPE.ELECTION_NOMINATION_SUPPORT,
          subjectModel: "ElectionNomination",
          subjectId: nomination._id,
          "payload.supportType": supporter.supportType,
          "payload.supporterRollNumber": String(supporter.rollNumber || "").trim().toUpperCase(),
        },
        "Support confirmation request reissued"
      )
    }

    const notificationResult = await sendNominationSupportRequests({
      election,
      nomination,
      candidateName: studentProfile?.userId?.name || "",
      candidateRollNumber: studentProfile.rollNumber,
      postTitle: post.title,
      supporters: supportersToNotify,
    })

    const sentAt = new Date()
    if ((notificationResult?.sentKeys || []).length > 0) {
      nomination.proposerEntries = (nomination.proposerEntries || []).map((entry) => (
        notificationResult.sentKeys.includes(buildSupporterPayloadKey("proposer", entry.rollNumber))
          ? { ...(entry?.toObject ? entry.toObject() : entry), invitedAt: sentAt }
          : entry
      ))
      nomination.seconderEntries = (nomination.seconderEntries || []).map((entry) => (
        notificationResult.sentKeys.includes(buildSupporterPayloadKey("seconder", entry.rollNumber))
          ? { ...(entry?.toObject ? entry.toObject() : entry), invitedAt: sentAt }
          : entry
      ))
      await nomination.save()
    }

    await nomination.populate({ path: "candidateUserId", select: "name email profileImage" })
    await nomination.populate({ path: "candidateProfileId", select: "idCard" })

    return success(
      serializeNomination(nomination),
      200,
      notificationResult?.failures?.length
        ? `Nomination saved, but some supporter confirmation emails could not be sent: ${notificationResult.failures.join("; ")}`
        : "Nomination saved successfully"
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
      .populate({ path: "candidateUserId", select: "name email profileImage" })
      .populate({ path: "candidateProfileId", select: "idCard" })

    if (!nomination) return notFound("Nomination")

    nomination.status = NOMINATION_STATUS.WITHDRAWN
    nomination.withdrawnAt = new Date()
    await nomination.save()
    await invalidateActionLinkTokens(
      {
        type: ACTION_LINK_TOKEN_TYPE.ELECTION_NOMINATION_SUPPORT,
        subjectModel: "ElectionNomination",
        subjectId: nomination._id,
      },
      "Nomination withdrawn"
    )

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
      .populate({ path: "candidateUserId", select: "name email profileImage" })
      .populate({ path: "candidateProfileId", select: "idCard" })

    if (!nomination) return notFound("Nomination")

    if (payload.status === NOMINATION_STATUS.VERIFIED) {
      const post = resolvePostById(election, nomination.postId)
      if (!post) return notFound("Election post")

      const supporterChecks = getSupporterStatusChecks(nomination, post)
      if (supporterChecks.rejectedSupporters.length > 0) {
        return badRequest("Nomination cannot be verified while any proposer or seconder has rejected support")
      }
      if (supporterChecks.pendingSupporters.length > 0) {
        return badRequest("Nomination cannot be verified until all proposers and seconders have responded")
      }
      if (!supporterChecks.allAccepted) {
        return badRequest("Nomination cannot be verified until all required proposers and seconders have accepted")
      }
    }

    nomination.status = payload.status
    nomination.review = {
      reviewedBy: user._id,
      reviewedAt: new Date(),
      notes: String(payload.notes || "").trim(),
    }
    await nomination.save()

    if ([NOMINATION_STATUS.REJECTED, NOMINATION_STATUS.WITHDRAWN].includes(payload.status)) {
      await invalidateActionLinkTokens(
        {
          type: ACTION_LINK_TOKEN_TYPE.ELECTION_NOMINATION_SUPPORT,
          subjectModel: "ElectionNomination",
          subjectId: nomination._id,
        },
        "Nomination review completed"
      )
    }

    return success(
      serializeNomination(nomination),
      200,
      "Nomination reviewed successfully"
    )
  }

  async castVote(electionId, postId, payload, user) {
    return forbidden("Voting is only available through the secure ballot link sent by email")
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
