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

const PRE_VOTING_EMAIL_WINDOW_MS = 30 * 60 * 1000
const DISPATCH_INTERVAL_MS = 60 * 1000
const EMAIL_RETRY_ATTEMPTS = 3
const EMAIL_RETRY_DELAY_MS = 3000
const activeDispatches = new Set()
const queuedDispatches = new Set()
const dispatchQueue = []
let schedulerIntervalId = null
let isDispatchWorkerActive = false

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
  }

  await election.save()
  emitVotingDispatchUpdate(election)
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

const hasValidVotingWindow = (election) => {
  const votingStartAt = new Date(election?.timeline?.votingStartAt)
  const votingEndAt = new Date(election?.timeline?.votingEndAt)

  if (Number.isNaN(votingStartAt.getTime()) || Number.isNaN(votingEndAt.getTime())) {
    return null
  }

  return { votingStartAt, votingEndAt }
}

const isAutomaticDispatchDueNow = (election, now = new Date()) => {
  if (election?.status !== "published" || !isEmailVotingEnabled(election)) return false

  const votingWindow = hasValidVotingWindow(election)
  if (!votingWindow) return false

  const { votingStartAt } = votingWindow

  return now.getTime() >= votingStartAt.getTime() - PRE_VOTING_EMAIL_WINDOW_MS &&
    now.getTime() < votingStartAt.getTime()
}

const isManualDispatchAllowedNow = (election, now = new Date()) => {
  if (election?.status !== "published" || !isEmailVotingEnabled(election)) return false

  const votingWindow = hasValidVotingWindow(election)
  if (!votingWindow) return false

  const { votingStartAt, votingEndAt } = votingWindow

  return now.getTime() >= votingStartAt.getTime() &&
    now.getTime() < votingEndAt.getTime()
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

const resolveDispatchRecipients = async (election, { targetRollNumbers = [] } = {}) => {
  const eligibleProfiles = await collectEligibleVoterProfiles(election)
  const targetRollNumberSet = new Set(normalizeRollNumbers(targetRollNumbers))
  const verifiedNominations = await ElectionNomination.find({
    electionId: election._id,
    status: "verified",
  }).select("postId")
  const verifiedPostIds = new Set(verifiedNominations.map((nomination) => String(nomination.postId)))
  const voterIdsWithVotes = new Set(
    (await ElectionVote.distinct("voterUserId", { electionId: election._id })).map((value) => String(value))
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

const sendVotingEmailToRecipient = async (
  election,
  { profile, eligiblePosts },
  { resendMode = "reuse_existing" } = {}
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

const runQueuedVotingEmailDispatch = async ({
  electionId,
  dispatchKey,
  resendMode = "reuse_existing",
  targetRollNumbers = [],
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

    const recipients = await resolveDispatchRecipients(election, { targetRollNumbers })
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
        error: "No eligible voters with verified voting options are available for email dispatch",
        totalRecipients: 0,
        sentRecipients: 0,
        failedRecipients: 0,
      }
    }

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
    })

    let sentRecipients = 0
    let failedRecipients = 0
    const errors = []

    for (const recipient of recipients) {
      const recipientResult = await sendVotingEmailToRecipient(election, recipient, { resendMode })

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

export const triggerElectionVotingEmailDispatchForElection = async (
  electionId,
  reason = "manual",
  { resendMode = "reuse_existing", targetRollNumbers = [] } = {}
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
    const recipients = await resolveDispatchRecipients(election, {
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
    })

    queuedDispatches.add(activeDispatchKey)
    dispatchQueue.push({
      electionId: String(election._id),
      dispatchKey,
      resendMode,
      targetRollNumbers: normalizedTargetRollNumbers,
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

export const scanAndTriggerElectionVotingEmailDispatches = async () => {
  const elections = await Election.find({ status: "published" }).select("_id timeline status votingEmailDispatch posts title")
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
}
