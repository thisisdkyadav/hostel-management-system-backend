import {
  ActionLinkToken,
  Election,
  ElectionNomination,
  ElectionVote,
  StudentProfile,
} from "../../../../models/index.js"
import { emailService } from "../../../../services/email/email.service.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import {
  ACTION_LINK_TOKEN_TYPE,
  createActionLinkToken,
  getRawActionLinkToken,
  invalidateActionLinkTokens,
} from "../../../../services/action-links/action-link-token.service.js"
import { emitToRole } from "../../../../utils/socketHandlers.js"

const DEFAULT_VOTING_EMAIL_AUTO_SEND_LEAD_MS = 6 * 60 * 60 * 1000
const DISPATCH_INTERVAL_MS = 60 * 1000
const EMAIL_RETRY_ATTEMPTS = 3
const EMAIL_RETRY_DELAY_MS = 3000
const MAX_EMAIL_DISPATCH_RECIPIENTS = 10000
const activeDispatches = new Set()
const queuedDispatches = new Set()
const dispatchQueue = []
let schedulerIntervalId = null
let isDispatchWorkerActive = false
const activeTestDispatches = new Set()
const queuedTestDispatches = new Set()
const testDispatchQueue = []
let isTestDispatchWorkerActive = false

const emitVotingDispatchUpdate = (election) => {
  if (!election?._id) return

  const payload = {
    electionId: String(election._id),
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
  }

  emitToRole(ROLES.ADMIN, "election:voting-live:dispatch", payload)
  emitToRole(ROLES.SUPER_ADMIN, "election:voting-live:dispatch", payload)
}

const persistDispatchState = async (election, nextDispatchState = {}) => {
  election.votingEmailDispatch = {
    dispatchKey: nextDispatchState.dispatchKey || "",
    status: nextDispatchState.status || "idle",
    startedAt: nextDispatchState.startedAt || null,
    completedAt: nextDispatchState.completedAt || null,
    lastTriggeredAt: nextDispatchState.lastTriggeredAt || null,
    totalRecipients: Number(nextDispatchState.totalRecipients || 0),
    sentRecipients: Number(nextDispatchState.sentRecipients || 0),
    failedRecipients: Number(nextDispatchState.failedRecipients || 0),
    lastError: nextDispatchState.lastError || "",
    recipientStatuses: Array.isArray(nextDispatchState.recipientStatuses)
      ? nextDispatchState.recipientStatuses
      : Array.isArray(election.votingEmailDispatch?.recipientStatuses)
        ? election.votingEmailDispatch.recipientStatuses
        : [],
  }

  await election.save()
  emitVotingDispatchUpdate(election)
}

const persistTestDispatchState = async (election, nextDispatchState = {}) => {
  election.testEmailDispatch = {
    dispatchKey: nextDispatchState.dispatchKey || "",
    status: nextDispatchState.status || "idle",
    startedAt: nextDispatchState.startedAt || null,
    completedAt: nextDispatchState.completedAt || null,
    lastTriggeredAt: nextDispatchState.lastTriggeredAt || null,
    totalRecipients: Number(nextDispatchState.totalRecipients || 0),
    sentRecipients: Number(nextDispatchState.sentRecipients || 0),
    failedRecipients: Number(nextDispatchState.failedRecipients || 0),
    lastError: nextDispatchState.lastError || "",
    recipientStatuses: Array.isArray(nextDispatchState.recipientStatuses)
      ? nextDispatchState.recipientStatuses
      : Array.isArray(election.testEmailDispatch?.recipientStatuses)
        ? election.testEmailDispatch.recipientStatuses
        : [],
  }

  await election.save()
}

const normalizeStringArray = (values = []) =>
  Array.isArray(values)
    ? [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))]
    : []

const normalizeRollNumbers = (values = []) =>
  Array.isArray(values)
    ? [...new Set(values.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))]
    : []

const escapeRegex = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const buildCaseInsensitiveExactRegexes = (values = []) =>
  normalizeStringArray(values).map((value) => new RegExp(`^${escapeRegex(value)}$`, "i"))

const doesProfileMatchScope = (profile, scope = {}) => {
  const batches = normalizeStringArray(scope?.batches)
  const groups = normalizeStringArray(scope?.groups)
  const extraRollNumbers = normalizeRollNumbers(scope?.extraRollNumbers)
  if (batches.length === 0 && groups.length === 0 && extraRollNumbers.length === 0) return false

  const profileBatch = String(profile?.batch || "").trim()
  const profileGroups = normalizeStringArray(profile?.groups).map((group) => group.toLowerCase())
  const normalizedScopeGroups = groups.map((group) => group.toLowerCase())
  const profileRollNumber = String(profile?.rollNumber || "").trim().toUpperCase()

  return (
    batches.includes(profileBatch) ||
    normalizedScopeGroups.some((group) => profileGroups.includes(group)) ||
    extraRollNumbers.includes(profileRollNumber)
  )
}

const getVotingDispatchKey = (election) => {
  const votingStartAt = election?.timeline?.votingStartAt
  if (!votingStartAt) return ""
  const parsedDate = new Date(votingStartAt)
  return Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString()
}

const getElectionVotingAccessMode = (election) =>
  String(election?.votingAccess?.mode || "both").trim().toLowerCase() || "both"

const isEmailVotingEnabled = (election) => ["email", "both"].includes(getElectionVotingAccessMode(election))

const isVotingEmailAutoSendEnabled = (election) =>
  isEmailVotingEnabled(election) && Boolean(election?.votingAccess?.autoSendEnabled !== false)

const getVotingEmailAutoSendStartAt = (election) => {
  const votingStartAt = new Date(election?.timeline?.votingStartAt)
  if (Number.isNaN(votingStartAt.getTime()) || !isEmailVotingEnabled(election)) return null

  const configuredStartAt = new Date(election?.timeline?.votingEmailStartAt)
  if (!Number.isNaN(configuredStartAt.getTime())) {
    return configuredStartAt
  }

  return new Date(votingStartAt.getTime() - DEFAULT_VOTING_EMAIL_AUTO_SEND_LEAD_MS)
}

const hasValidVotingWindow = (election) => {
  const votingStartAt = new Date(election?.timeline?.votingStartAt)
  const votingEndAt = new Date(election?.timeline?.votingEndAt)

  if (Number.isNaN(votingStartAt.getTime()) || Number.isNaN(votingEndAt.getTime())) {
    return null
  }

  return { votingStartAt, votingEndAt }
}

const isAutomaticDispatchDueNow = (election, now = new Date()) => {
  if (election?.status !== "published" || !isVotingEmailAutoSendEnabled(election)) return false

  const votingWindow = hasValidVotingWindow(election)
  if (!votingWindow) return false

  const { votingStartAt } = votingWindow
  const autoSendStartAt = getVotingEmailAutoSendStartAt(election)
  if (!autoSendStartAt) return false

  return now.getTime() >= autoSendStartAt.getTime() && now.getTime() < votingStartAt.getTime()
}

const isManualDispatchAllowedNow = (election, now = new Date()) => {
  if (election?.status !== "published" || !isEmailVotingEnabled(election)) return false

  const votingWindow = hasValidVotingWindow(election)
  if (!votingWindow) return false

  const { votingEndAt } = votingWindow
  const manualWindowStartAt = getVotingEmailAutoSendStartAt(election)
  if (!manualWindowStartAt) return false

  return now.getTime() >= manualWindowStartAt.getTime() && now.getTime() < votingEndAt.getTime()
}

const collectEligibleVoterProfiles = async (election) => {
  const mockRollNumbers = normalizeRollNumbers(election?.mockSettings?.voterRollNumbers)
  const isMockElection = Boolean(election?.mockSettings?.enabled)
  const allBatches = new Set()
  const allGroups = new Set()
  const allExtraRollNumbers = new Set()

  for (const post of election?.posts || []) {
    for (const batch of normalizeStringArray(post?.voterEligibility?.batches)) {
      allBatches.add(batch)
    }
    for (const group of normalizeStringArray(post?.voterEligibility?.groups)) {
      allGroups.add(group)
    }
    for (const rollNumber of normalizeRollNumbers(post?.voterEligibility?.extraRollNumbers)) {
      allExtraRollNumbers.add(rollNumber)
    }
  }

  if (allBatches.size === 0 && allGroups.size === 0 && allExtraRollNumbers.size === 0) {
    return []
  }

  const query = {
    status: "Active",
    $or: [],
    ...(isMockElection ? { rollNumber: { $in: mockRollNumbers } } : {}),
  }
  if (allBatches.size > 0) {
    query.$or.push({ batch: { $in: [...allBatches] } })
  }
  if (allGroups.size > 0) {
    query.$or.push({ groups: { $in: buildCaseInsensitiveExactRegexes([...allGroups]) } })
  }
  if (allExtraRollNumbers.size > 0) {
    query.$or.push({ rollNumber: { $in: [...allExtraRollNumbers] } })
  }

  const profiles = await StudentProfile.find(query)
    .populate({ path: "userId", select: "name email profileImage" })

  return profiles
    .map((profile) => {
      const eligiblePosts = (election?.posts || []).filter((post) => doesProfileMatchScope(profile, post?.voterEligibility))
      return {
        profile,
        eligiblePosts,
      }
    })
    .filter((item) => item.eligiblePosts.length > 0)
}

export const resolveElectionVotingRecipients = async (
  election,
  { targetRollNumbers = [], includeVoted = false } = {}
) => {
  const eligibleProfiles = await collectEligibleVoterProfiles(election)
  const targetRollNumberSet = new Set(normalizeRollNumbers(targetRollNumbers))
  const verifiedNominations = await ElectionNomination.find({
    electionId: election._id,
    status: "verified",
  }).select("postId")
  const verifiedPostIds = new Set(verifiedNominations.map((nomination) => String(nomination.postId)))
  const voterIdsWithVotes = includeVoted
    ? new Set()
    : new Set(
        (await ElectionVote.distinct("voterUserId", { electionId: election._id })).map((value) =>
          String(value)
        )
      )

  return eligibleProfiles
    .map(({ profile, eligiblePosts }) => ({
      profile,
      eligiblePosts: eligiblePosts.filter((post) => verifiedPostIds.has(String(post._id))),
    }))
    .filter(
      ({ profile, eligiblePosts }) =>
        eligiblePosts.length > 0 &&
        !voterIdsWithVotes.has(String(profile?.userId?._id || "")) &&
        (
          targetRollNumberSet.size === 0 ||
          targetRollNumberSet.has(String(profile?.rollNumber || "").trim().toUpperCase())
        )
    )
}

const findReusableVotingLinkToken = async (election, userId, dispatchKey) => {
  if (!userId || !dispatchKey) return null

  return ActionLinkToken.findOne({
    type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
    subjectModel: "Election",
    subjectId: election._id,
    recipientUserId: userId,
    usedAt: null,
    invalidatedAt: null,
    expiresAt: { $gt: new Date() },
    "payload.dispatchKey": dispatchKey,
  }).sort({ createdAt: -1 })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const buildRecipientDispatchStatuses = (recipients = []) =>
  recipients.map(({ profile }) => ({
    userId: profile?.userId?._id || null,
    name: profile?.userId?.name || "",
    email: String(profile?.userId?.email || "").trim(),
    rollNumber: String(profile?.rollNumber || "").trim().toUpperCase(),
    status: "pending",
    sentAt: null,
    lastError: "",
  }))

const buildRecipientStatusKey = (entry = {}) => {
  const userId = String(entry?.userId || entry?.profile?.userId?._id || "").trim()
  if (userId) return `user:${userId}`

  const rollNumber = String(entry?.rollNumber || entry?.profile?.rollNumber || "")
    .trim()
    .toUpperCase()
  return rollNumber ? `roll:${rollNumber}` : ""
}

const mergeRecipientDispatchStatuses = ({
  baselineStatuses = [],
  existingStatuses = [],
  sentStatusKeys = new Set(),
} = {}) => {
  const existingStatusMap = new Map(
    (Array.isArray(existingStatuses) ? existingStatuses : [])
      .map((entry) => [buildRecipientStatusKey(entry), entry])
      .filter(([key]) => Boolean(key))
  )

  return (Array.isArray(baselineStatuses) ? baselineStatuses : []).map((baselineEntry) => {
    const statusKey = buildRecipientStatusKey(baselineEntry)
    const existingEntry = existingStatusMap.get(statusKey)
    const mergedEntry = existingEntry
      ? {
          ...baselineEntry,
          status: ["pending", "failed"].includes(String(existingEntry?.status || ""))
            ? existingEntry.status
            : baselineEntry.status,
          sentAt: baselineEntry.sentAt || null,
          lastError: ["pending", "failed"].includes(String(existingEntry?.status || ""))
            ? existingEntry?.lastError || ""
            : "",
        }
      : baselineEntry

    if (sentStatusKeys.has(statusKey) && mergedEntry.status !== "sent") {
      return {
        ...mergedEntry,
        status: "sent",
        sentAt: existingEntry?.sentAt || mergedEntry.sentAt || null,
        lastError: "",
      }
    }

    return mergedEntry
  })
}

const applyRecipientDispatchResult = (recipientStatuses = [], recipient = {}, result = {}) => {
  const recipientStatusKey = buildRecipientStatusKey(recipient)

  return (Array.isArray(recipientStatuses) ? recipientStatuses : []).map((entry) => {
    if (buildRecipientStatusKey(entry) !== recipientStatusKey) {
      return entry
    }

    return {
      ...entry,
      status: result?.success ? "sent" : "failed",
      sentAt: result?.success ? new Date() : entry?.sentAt || null,
      lastError: result?.success ? "" : result?.error || "Failed to send voting email",
    }
  })
}

const getReceivedVotingRecipientStatusKeys = async (election) => {
  if (!election?._id) return new Set()

  const [usableTokens, votedUserIds] = await Promise.all([
    ActionLinkToken.find({
      type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
      subjectModel: "Election",
      subjectId: election._id,
      $or: [
        { usedAt: { $ne: null } },
        {
          invalidatedAt: null,
          expiresAt: { $gt: new Date() },
        },
      ],
    }).select("recipientUserId"),
    ElectionVote.distinct("voterUserId", {
      electionId: election._id,
    }),
  ])

  return new Set(
    [
      ...usableTokens.map((token) => buildRecipientStatusKey({ userId: token?.recipientUserId })),
      ...votedUserIds.map((userId) => buildRecipientStatusKey({ userId })),
    ].filter(Boolean)
  )
}

export const buildElectionVotingRecipientStatuses = async (election) => {
  const allRecipients = await resolveElectionVotingRecipients(election, { includeVoted: true })
  const baselineStatuses = buildRecipientDispatchStatuses(allRecipients)
  const existingStatuses = Array.isArray(election?.votingEmailDispatch?.recipientStatuses)
    ? election.votingEmailDispatch.recipientStatuses
    : []
  const sentStatusKeys = await getReceivedVotingRecipientStatusKeys(election)

  return mergeRecipientDispatchStatuses({
    baselineStatuses,
    existingStatuses,
    sentStatusKeys,
  })
}

const resolveElectionTestEmailRecipients = async (election, { targetRollNumbers = [] } = {}) => {
  const eligibleProfiles = await collectEligibleVoterProfiles(election)
  const targetRollNumberSet = new Set(normalizeRollNumbers(targetRollNumbers))

  return eligibleProfiles.filter(
    ({ profile }) =>
      targetRollNumberSet.size === 0 ||
      targetRollNumberSet.has(String(profile?.rollNumber || "").trim().toUpperCase())
  )
}

export const buildElectionTestRecipientStatuses = async (election) => {
  const allRecipients = await collectEligibleVoterProfiles(election)
  const baselineStatuses = buildRecipientDispatchStatuses(allRecipients)
  const existingStatuses = Array.isArray(election?.testEmailDispatch?.recipientStatuses)
    ? election.testEmailDispatch.recipientStatuses
    : []
  const existingStatusMap = new Map(
    existingStatuses
      .map((entry) => [buildRecipientStatusKey(entry), entry])
      .filter(([key]) => Boolean(key))
  )

  return baselineStatuses.map((baselineEntry) => {
    const statusKey = buildRecipientStatusKey(baselineEntry)
    const existingEntry = existingStatusMap.get(statusKey)
    if (!existingEntry) return baselineEntry

    return {
      ...baselineEntry,
      status: existingEntry?.status || baselineEntry.status,
      sentAt: existingEntry?.sentAt || null,
      lastError: existingEntry?.lastError || "",
    }
  })
}

const sendVotingEmailToRecipient = async (
  election,
  { profile, eligiblePosts },
  {
    resendMode = "reuse_existing",
    reminder = false,
  } = {}
) => {
  const userId = profile?.userId?._id || null
  const email = String(profile?.userId?.email || "").trim()
  const rollNumber = String(profile?.rollNumber || "").trim().toUpperCase()

  if (!userId || !email) {
    return {
      success: false,
      error: `${rollNumber || "Unknown voter"} is missing an email address`,
    }
  }

  const dispatchKey = getVotingDispatchKey(election)
  let rawToken = ""
  let createdTokenDoc = null

  if (resendMode === "reuse_existing") {
    const reusableTokenDoc = await findReusableVotingLinkToken(election, userId, dispatchKey)
    rawToken = getRawActionLinkToken(reusableTokenDoc)
  }

  if (!rawToken) {
    await invalidateActionLinkTokens(
      {
        type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
        subjectModel: "Election",
        subjectId: election._id,
        recipientUserId: userId,
      },
      resendMode === "reuse_existing" ? "Voting link refreshed" : "Voting link reissued"
    )

    const tokenResult = await createActionLinkToken({
      type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
      subjectModel: "Election",
      subjectId: election._id,
      recipientUserId: userId,
      recipientEmail: email,
      payload: {
        electionId: String(election._id),
        dispatchKey,
      },
      expiresAt: new Date(election.timeline.votingEndAt),
    })

    rawToken = tokenResult.rawToken
    createdTokenDoc = tokenResult.tokenDoc
  }

  let lastEmailError = ""

  for (let attempt = 1; attempt <= EMAIL_RETRY_ATTEMPTS; attempt += 1) {
    const emailResult = await emailService.sendElectionVotingBallotEmail({
      email,
      studentName: profile?.userId?.name || "",
      electionTitle: election.title,
      votingStartAt: new Date(election.timeline.votingStartAt).toLocaleString(),
      votingEndAt: new Date(election.timeline.votingEndAt).toLocaleString(),
      postCount: eligiblePosts.length,
      ballotToken: rawToken,
      isMockElection: Boolean(election?.mockSettings?.enabled),
      reminder,
    })

    if (emailResult?.success) {
      return {
        success: true,
        attemptsUsed: attempt,
      }
    }

    lastEmailError = emailResult?.error || "Failed to send voting email"

    if (attempt < EMAIL_RETRY_ATTEMPTS) {
      await sleep(EMAIL_RETRY_DELAY_MS)
    }
  }

  if (createdTokenDoc?._id) {
    await ActionLinkToken.updateOne(
      {
        _id: createdTokenDoc._id,
        invalidatedAt: null,
      },
      {
        $set: {
          invalidatedAt: new Date(),
          invalidationReason: "Voting email delivery failed",
        },
      }
    )
  }

  return {
    success: false,
    error: `${rollNumber || "Unknown voter"}: ${lastEmailError}`,
  }
}

const sendTestEmailToRecipient = async (election, { profile }) => {
  const email = String(profile?.userId?.email || "").trim()
  const rollNumber = String(profile?.rollNumber || "").trim().toUpperCase()

  if (!email) {
    return {
      success: false,
      error: `${rollNumber || "Unknown student"} is missing an email address`,
    }
  }

  let lastEmailError = ""
  for (let attempt = 1; attempt <= EMAIL_RETRY_ATTEMPTS; attempt += 1) {
    const emailResult = await emailService.sendElectionTestEmail({
      email,
      studentName: profile?.userId?.name || "",
      electionTitle: election.title,
    })

    if (emailResult?.success) {
      return {
        success: true,
        attemptsUsed: attempt,
      }
    }

    lastEmailError = emailResult?.error || "Failed to send test email"

    if (attempt < EMAIL_RETRY_ATTEMPTS) {
      await sleep(EMAIL_RETRY_DELAY_MS)
    }
  }

  return {
    success: false,
    error: `${rollNumber || "Unknown student"}: ${lastEmailError}`,
  }
}

const runQueuedVotingEmailDispatch = async ({
  electionId,
  dispatchKey,
  resendMode = "reuse_existing",
  targetRollNumbers = [],
  reminder = false,
} = {}) => {
  const activeDispatchKey = String(electionId || "")
  if (!activeDispatchKey) {
    return {
      queued: false,
      error: "Election id is required",
    }
  }

  activeDispatches.add(activeDispatchKey)

  try {
    const election = await Election.findById(electionId)
    if (!election) {
      return {
        queued: false,
        error: "Election not found",
      }
    }

    const currentDispatchKey = getVotingDispatchKey(election)
    if (!currentDispatchKey || currentDispatchKey !== dispatchKey) {
      await persistDispatchState(election, {
        dispatchKey: currentDispatchKey || dispatchKey,
        status: "failed",
        startedAt: election.votingEmailDispatch?.startedAt || null,
        completedAt: new Date(),
        lastTriggeredAt: new Date(),
        totalRecipients: Number(election.votingEmailDispatch?.totalRecipients || 0),
        sentRecipients: Number(election.votingEmailDispatch?.sentRecipients || 0),
        failedRecipients: Number(election.votingEmailDispatch?.failedRecipients || 0),
        lastError: "Voting start time changed before queued email sending began",
      })
      return {
        queued: false,
        error: "Voting start time changed before queued email sending began",
      }
    }

    const recipients = await resolveElectionVotingRecipients(election, { targetRollNumbers })
    if (recipients.length === 0) {
      await persistDispatchState(election, {
        dispatchKey,
        status: "failed",
        startedAt: new Date(),
        completedAt: new Date(),
        lastTriggeredAt: new Date(),
        totalRecipients: 0,
        sentRecipients: 0,
        failedRecipients: 0,
        lastError: "No eligible voters with verified voting options are available for email dispatch",
        recipientStatuses: [],
      })

      return {
        queued: false,
        error: "No eligible voters with verified voting options are available for email dispatch",
        totalRecipients: 0,
        sentRecipients: 0,
        failedRecipients: 0,
      }
    }

    if (recipients.length > MAX_EMAIL_DISPATCH_RECIPIENTS) {
      await persistDispatchState(election, {
        dispatchKey,
        status: "failed",
        startedAt: new Date(),
        completedAt: new Date(),
        lastTriggeredAt: new Date(),
        totalRecipients: recipients.length,
        sentRecipients: 0,
        failedRecipients: 0,
        lastError: `Voting email sending is limited to ${MAX_EMAIL_DISPATCH_RECIPIENTS} recipients per dispatch`,
        recipientStatuses: await buildElectionVotingRecipientStatuses(election),
      })

      return {
        queued: false,
        error: `Voting email sending is limited to ${MAX_EMAIL_DISPATCH_RECIPIENTS} recipients per dispatch`,
        totalRecipients: recipients.length,
      }
    }

    const recipientStatuses = await buildElectionVotingRecipientStatuses(election)

    await persistDispatchState(election, {
      dispatchKey,
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      lastTriggeredAt: new Date(),
      totalRecipients: recipients.length,
      sentRecipients: 0,
      failedRecipients: 0,
      lastError: "",
      recipientStatuses,
    })

    let sentRecipients = 0
    let failedRecipients = 0
    const errors = []
    let currentRecipientStatuses = Array.isArray(election.votingEmailDispatch?.recipientStatuses)
      ? election.votingEmailDispatch.recipientStatuses
      : recipientStatuses

    for (const recipient of recipients) {
      const recipientResult = await sendVotingEmailToRecipient(election, recipient, {
        resendMode,
        reminder,
      })
      currentRecipientStatuses = applyRecipientDispatchResult(
        currentRecipientStatuses,
        recipient,
        recipientResult
      )

      if (recipientResult.success) {
        sentRecipients += 1
      } else {
        failedRecipients += 1
        errors.push(recipientResult.error)
      }

      await persistDispatchState(election, {
        dispatchKey,
        status: "running",
        startedAt: election.votingEmailDispatch?.startedAt || new Date(),
        completedAt: null,
        lastTriggeredAt: new Date(),
        totalRecipients: recipients.length,
        sentRecipients,
        failedRecipients,
        lastError: errors[0] || "",
        recipientStatuses: currentRecipientStatuses,
      })
    }

    await persistDispatchState(election, {
      dispatchKey,
      status: failedRecipients > 0 ? "failed" : "completed",
      startedAt: election.votingEmailDispatch?.startedAt || new Date(),
      completedAt: new Date(),
      lastTriggeredAt: new Date(),
      totalRecipients: recipients.length,
      sentRecipients,
      failedRecipients,
      lastError: errors[0] || "",
      recipientStatuses: currentRecipientStatuses,
    })

    return {
      queued: true,
      totalRecipients: recipients.length,
      sentRecipients,
      failedRecipients,
    }
  } catch (error) {
    const failedElection = await Election.findByIdAndUpdate(
      electionId,
      {
        $set: {
          "votingEmailDispatch.status": "failed",
          "votingEmailDispatch.completedAt": new Date(),
          "votingEmailDispatch.lastTriggeredAt": new Date(),
          "votingEmailDispatch.lastError": error?.message || "Voting email dispatch failed",
        },
      },
      { new: true }
    )
    emitVotingDispatchUpdate(failedElection)
    return {
      queued: false,
      error: error?.message || "Voting email dispatch failed",
    }
  } finally {
    activeDispatches.delete(activeDispatchKey)
  }
}

const runQueuedElectionTestEmailDispatch = async ({
  electionId,
  targetRollNumbers = [],
} = {}) => {
  const activeDispatchKey = String(electionId || "")
  if (!activeDispatchKey) {
    return {
      queued: false,
      error: "Election id is required",
    }
  }

  activeTestDispatches.add(activeDispatchKey)

  try {
    const election = await Election.findById(electionId)
    if (!election) {
      return {
        queued: false,
        error: "Election not found",
      }
    }

    const recipients = await resolveElectionTestEmailRecipients(election, { targetRollNumbers })
    if (recipients.length === 0) {
      const recipientStatuses = await buildElectionTestRecipientStatuses(election)
      await persistTestDispatchState(election, {
        dispatchKey: new Date().toISOString(),
        status: "failed",
        startedAt: new Date(),
        completedAt: new Date(),
        lastTriggeredAt: new Date(),
        totalRecipients: 0,
        sentRecipients: 0,
        failedRecipients: 0,
        lastError: "No eligible students matched the selected roll numbers",
        recipientStatuses,
      })

      return {
        queued: false,
        error: "No eligible students matched the selected roll numbers",
      }
    }

    if (recipients.length > MAX_EMAIL_DISPATCH_RECIPIENTS) {
      await persistTestDispatchState(election, {
        dispatchKey: new Date().toISOString(),
        status: "failed",
        startedAt: new Date(),
        completedAt: new Date(),
        lastTriggeredAt: new Date(),
        totalRecipients: recipients.length,
        sentRecipients: 0,
        failedRecipients: 0,
        lastError: `Test email sending is limited to ${MAX_EMAIL_DISPATCH_RECIPIENTS} recipients per dispatch`,
        recipientStatuses: await buildElectionTestRecipientStatuses(election),
      })

      return {
        queued: false,
        error: `Test email sending is limited to ${MAX_EMAIL_DISPATCH_RECIPIENTS} recipients per dispatch`,
        totalRecipients: recipients.length,
      }
    }

    const recipientStatuses = await buildElectionTestRecipientStatuses(election)
    await persistTestDispatchState(election, {
      dispatchKey: new Date().toISOString(),
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      lastTriggeredAt: new Date(),
      totalRecipients: recipients.length,
      sentRecipients: 0,
      failedRecipients: 0,
      lastError: "",
      recipientStatuses,
    })

    let sentRecipients = 0
    let failedRecipients = 0
    const errors = []
    let currentRecipientStatuses = Array.isArray(election.testEmailDispatch?.recipientStatuses)
      ? election.testEmailDispatch.recipientStatuses
      : recipientStatuses

    for (const recipient of recipients) {
      const recipientResult = await sendTestEmailToRecipient(election, recipient)
      currentRecipientStatuses = applyRecipientDispatchResult(
        currentRecipientStatuses,
        recipient,
        recipientResult
      )

      if (recipientResult.success) {
        sentRecipients += 1
      } else {
        failedRecipients += 1
        errors.push(recipientResult.error)
      }

      await persistTestDispatchState(election, {
        dispatchKey: election.testEmailDispatch?.dispatchKey || new Date().toISOString(),
        status: "running",
        startedAt: election.testEmailDispatch?.startedAt || new Date(),
        completedAt: null,
        lastTriggeredAt: new Date(),
        totalRecipients: recipients.length,
        sentRecipients,
        failedRecipients,
        lastError: errors[0] || "",
        recipientStatuses: currentRecipientStatuses,
      })
    }

    await persistTestDispatchState(election, {
      dispatchKey: election.testEmailDispatch?.dispatchKey || new Date().toISOString(),
      status: failedRecipients > 0 ? "failed" : "completed",
      startedAt: election.testEmailDispatch?.startedAt || new Date(),
      completedAt: new Date(),
      lastTriggeredAt: new Date(),
      totalRecipients: recipients.length,
      sentRecipients,
      failedRecipients,
      lastError: errors[0] || "",
      recipientStatuses: currentRecipientStatuses,
    })

    return {
      queued: true,
      totalRecipients: recipients.length,
      sentRecipients,
      failedRecipients,
    }
  } catch (error) {
    await Election.findByIdAndUpdate(
      electionId,
      {
        $set: {
          "testEmailDispatch.status": "failed",
          "testEmailDispatch.completedAt": new Date(),
          "testEmailDispatch.lastTriggeredAt": new Date(),
          "testEmailDispatch.lastError": error?.message || "Test email dispatch failed",
        },
      }
    )
    return {
      queued: false,
      error: error?.message || "Test email dispatch failed",
    }
  } finally {
    activeTestDispatches.delete(activeDispatchKey)
  }
}

const processDispatchQueue = async () => {
  if (isDispatchWorkerActive) return

  isDispatchWorkerActive = true

  try {
    while (dispatchQueue.length > 0) {
      const nextJob = dispatchQueue.shift()
      if (!nextJob?.electionId) {
        continue
      }

      queuedDispatches.delete(String(nextJob.electionId))
      await runQueuedVotingEmailDispatch(nextJob)
    }
  } finally {
    isDispatchWorkerActive = false
  }
}

const processTestDispatchQueue = async () => {
  if (isTestDispatchWorkerActive) return

  isTestDispatchWorkerActive = true

  try {
    while (testDispatchQueue.length > 0) {
      const nextJob = testDispatchQueue.shift()
      if (!nextJob?.electionId) {
        continue
      }

      queuedTestDispatches.delete(String(nextJob.electionId))
      await runQueuedElectionTestEmailDispatch(nextJob)
    }
  } finally {
    isTestDispatchWorkerActive = false
  }
}

export const triggerElectionVotingEmailDispatchForElection = async (
  electionId,
  reason = "manual",
  { resendMode = "reuse_existing", targetRollNumbers = [], reminder = false } = {}
) => {
  const activeDispatchKey = String(electionId || "")
  if (
    !activeDispatchKey ||
    activeDispatches.has(activeDispatchKey) ||
    queuedDispatches.has(activeDispatchKey)
  ) {
    return {
      queued: false,
      error: "Voting email dispatch is already queued or running",
    }
  }

  try {
    const election = await Election.findById(electionId)
    const canDispatch = reason === "manual"
      ? isManualDispatchAllowedNow(election)
      : isAutomaticDispatchDueNow(election)

    if (!election || !canDispatch) {
      return {
        queued: false,
        error: "Voting email dispatch is not allowed right now",
      }
    }

    if (reminder && reason !== "manual") {
      return {
        queued: false,
        error: "Voting reminders can only be sent manually",
      }
    }

    if (reminder) {
      const votingWindow = hasValidVotingWindow(election)
      const now = new Date()
      if (
        !votingWindow ||
        now.getTime() < votingWindow.votingStartAt.getTime() ||
        now.getTime() >= votingWindow.votingEndAt.getTime()
      ) {
        return {
          queued: false,
          error: "Voting reminders can only be sent while voting is live",
        }
      }
    }

    const dispatchKey = getVotingDispatchKey(election)
    if (!dispatchKey) {
      return {
        queued: false,
        error: "Voting start time is not configured correctly",
      }
    }

    const existingDispatchKey = String(election?.votingEmailDispatch?.dispatchKey || "")
    const existingStatus = String(election?.votingEmailDispatch?.status || "idle")

    if (
      existingDispatchKey === dispatchKey &&
      (
        ["queued", "running"].includes(existingStatus) ||
        (reason !== "manual" && ["completed", "failed"].includes(existingStatus))
      )
    ) {
      return {
        queued: false,
        error: "Voting email dispatch is already queued or running for this voting window",
      }
    }

    const normalizedTargetRollNumbers = normalizeRollNumbers(targetRollNumbers)
    const recipients = await resolveElectionVotingRecipients(election, {
      targetRollNumbers: normalizedTargetRollNumbers,
    })

    if (recipients.length === 0) {
      await persistDispatchState(election, {
        dispatchKey,
        status: "failed",
        startedAt: new Date(),
        completedAt: new Date(),
        lastTriggeredAt: new Date(),
        totalRecipients: 0,
        sentRecipients: 0,
        failedRecipients: 0,
        lastError: "No eligible voters with verified voting options are available for email dispatch",
      })

      return {
        queued: false,
        error: election.votingEmailDispatch.lastError,
        requestedRecipients: normalizedTargetRollNumbers.length,
        totalRecipients: 0,
        sentRecipients: 0,
        failedRecipients: 0,
      }
    }

    if (recipients.length > MAX_EMAIL_DISPATCH_RECIPIENTS) {
      await persistDispatchState(election, {
        dispatchKey,
        status: "failed",
        startedAt: new Date(),
        completedAt: new Date(),
        lastTriggeredAt: new Date(),
        totalRecipients: recipients.length,
        sentRecipients: 0,
        failedRecipients: 0,
        lastError: `Voting email sending is limited to ${MAX_EMAIL_DISPATCH_RECIPIENTS} recipients per dispatch`,
        recipientStatuses: await buildElectionVotingRecipientStatuses(election),
      })

      return {
        queued: false,
        error: `Voting email sending is limited to ${MAX_EMAIL_DISPATCH_RECIPIENTS} recipients per dispatch`,
        requestedRecipients: normalizedTargetRollNumbers.length,
        totalRecipients: recipients.length,
      }
    }

    const recipientStatuses = await buildElectionVotingRecipientStatuses(election)

    await persistDispatchState(election, {
      dispatchKey,
      status: "queued",
      startedAt: null,
      completedAt: null,
      lastTriggeredAt: new Date(),
      totalRecipients: recipients.length,
      sentRecipients: 0,
      failedRecipients: 0,
      lastError: "",
      recipientStatuses,
    })

    queuedDispatches.add(activeDispatchKey)
    dispatchQueue.push({
      electionId: String(election._id),
      dispatchKey,
      resendMode,
      targetRollNumbers: normalizedTargetRollNumbers,
      reminder,
    })
    processDispatchQueue().catch((error) => {
      console.error("Election voting dispatch queue failed:", error?.message || error)
    })

    return {
      queued: true,
      requestedRecipients: normalizedTargetRollNumbers.length,
      totalRecipients: recipients.length,
      sentRecipients: 0,
      failedRecipients: 0,
    }
  } catch (error) {
    const failedElection = await Election.findByIdAndUpdate(
      electionId,
      {
        $set: {
          "votingEmailDispatch.status": "failed",
          "votingEmailDispatch.completedAt": new Date(),
          "votingEmailDispatch.lastTriggeredAt": new Date(),
          "votingEmailDispatch.lastError": error?.message || "Voting email dispatch failed",
        },
      },
      { new: true }
    )
    emitVotingDispatchUpdate(failedElection)
    return {
      queued: false,
      error: error?.message || "Voting email dispatch failed",
    }
  }
}

export const triggerElectionTestEmailDispatchForElection = async (
  electionId,
  { targetRollNumbers = [] } = {}
) => {
  const activeDispatchKey = String(electionId || "")
  if (
    !activeDispatchKey ||
    activeTestDispatches.has(activeDispatchKey) ||
    queuedTestDispatches.has(activeDispatchKey)
  ) {
    return {
      queued: false,
      error: "Test email dispatch is already queued or running",
    }
  }

  try {
    const election = await Election.findById(electionId)
    if (!election) {
      return {
        queued: false,
        error: "Election not found",
      }
    }

    const normalizedTargetRollNumbers = normalizeRollNumbers(targetRollNumbers)
    const recipients = await resolveElectionTestEmailRecipients(election, {
      targetRollNumbers: normalizedTargetRollNumbers,
    })
    const recipientStatuses = await buildElectionTestRecipientStatuses(election)

    if (recipients.length === 0) {
      await persistTestDispatchState(election, {
        dispatchKey: new Date().toISOString(),
        status: "failed",
        startedAt: new Date(),
        completedAt: new Date(),
        lastTriggeredAt: new Date(),
        totalRecipients: 0,
        sentRecipients: 0,
        failedRecipients: 0,
        lastError: "No eligible students matched the selected roll numbers",
        recipientStatuses,
      })

      return {
        queued: false,
        error: "No eligible students matched the selected roll numbers",
        requestedRecipients: normalizedTargetRollNumbers.length,
      }
    }

    if (recipients.length > MAX_EMAIL_DISPATCH_RECIPIENTS) {
      await persistTestDispatchState(election, {
        dispatchKey: new Date().toISOString(),
        status: "failed",
        startedAt: new Date(),
        completedAt: new Date(),
        lastTriggeredAt: new Date(),
        totalRecipients: recipients.length,
        sentRecipients: 0,
        failedRecipients: 0,
        lastError: `Test email sending is limited to ${MAX_EMAIL_DISPATCH_RECIPIENTS} recipients per dispatch`,
        recipientStatuses: await buildElectionTestRecipientStatuses(election),
      })

      return {
        queued: false,
        error: `Test email sending is limited to ${MAX_EMAIL_DISPATCH_RECIPIENTS} recipients per dispatch`,
        requestedRecipients: normalizedTargetRollNumbers.length,
        totalRecipients: recipients.length,
      }
    }

    await persistTestDispatchState(election, {
      dispatchKey: new Date().toISOString(),
      status: "queued",
      startedAt: null,
      completedAt: null,
      lastTriggeredAt: new Date(),
      totalRecipients: recipients.length,
      sentRecipients: 0,
      failedRecipients: 0,
      lastError: "",
      recipientStatuses,
    })

    queuedTestDispatches.add(activeDispatchKey)
    testDispatchQueue.push({
      electionId: String(election._id),
      targetRollNumbers: normalizedTargetRollNumbers,
    })
    processTestDispatchQueue().catch((error) => {
      console.error("Election test email dispatch queue failed:", error?.message || error)
    })

    return {
      queued: true,
      requestedRecipients: normalizedTargetRollNumbers.length,
      totalRecipients: recipients.length,
      sentRecipients: 0,
      failedRecipients: 0,
    }
  } catch (error) {
    await Election.findByIdAndUpdate(
      electionId,
      {
        $set: {
          "testEmailDispatch.status": "failed",
          "testEmailDispatch.completedAt": new Date(),
          "testEmailDispatch.lastTriggeredAt": new Date(),
          "testEmailDispatch.lastError": error?.message || "Test email dispatch failed",
        },
      }
    )
    return {
      queued: false,
      error: error?.message || "Test email dispatch failed",
    }
  }
}

export const scanAndTriggerElectionVotingEmailDispatches = async () => {
  const elections = await Election.find({ status: "published" }).select("_id timeline status votingAccess votingEmailDispatch posts title")
  for (const election of elections) {
    if (!isAutomaticDispatchDueNow(election)) continue
    triggerElectionVotingEmailDispatchForElection(election._id, "scheduler").catch((error) => {
      console.error("Election voting email dispatch failed:", error?.message || error)
    })
  }
}

export const startElectionVotingEmailScheduler = () => {
  if (schedulerIntervalId) return

  scanAndTriggerElectionVotingEmailDispatches().catch((error) => {
    console.error("Initial election voting email scan failed:", error?.message || error)
  })

  schedulerIntervalId = setInterval(() => {
    scanAndTriggerElectionVotingEmailDispatches().catch((error) => {
      console.error("Election voting email scheduler failed:", error?.message || error)
    })
  }, DISPATCH_INTERVAL_MS)
}

export const stopElectionVotingEmailScheduler = () => {
  if (!schedulerIntervalId) return
  clearInterval(schedulerIntervalId)
  schedulerIntervalId = null
}

export default {
  startElectionVotingEmailScheduler,
  stopElectionVotingEmailScheduler,
  scanAndTriggerElectionVotingEmailDispatches,
  triggerElectionVotingEmailDispatchForElection,
  triggerElectionTestEmailDispatchForElection,
}
