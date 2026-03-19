import {
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
  invalidateActionLinkTokens,
} from "../../../../services/action-links/action-link-token.service.js"
import { emitToRole } from "../../../../utils/socketHandlers.js"

const PRE_VOTING_EMAIL_WINDOW_MS = 30 * 60 * 1000
const DISPATCH_INTERVAL_MS = 60 * 1000
const EMAIL_BATCH_SIZE = 50
const activeDispatches = new Set()
let schedulerIntervalId = null

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

const normalizeStringArray = (values = []) =>
  Array.isArray(values)
    ? [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))]
    : []

const normalizeRollNumbers = (values = []) =>
  Array.isArray(values)
    ? [...new Set(values.map((item) => String(item || "").trim().toUpperCase()).filter(Boolean))]
    : []

const doesProfileMatchScope = (profile, scope = {}) => {
  const batches = normalizeStringArray(scope?.batches)
  const extraRollNumbers = normalizeRollNumbers(scope?.extraRollNumbers)
  if (batches.length === 0 && extraRollNumbers.length === 0) return false

  const profileBatch = String(profile?.batch || "").trim()
  const profileRollNumber = String(profile?.rollNumber || "").trim().toUpperCase()

  return batches.includes(profileBatch) || extraRollNumbers.includes(profileRollNumber)
}

const getVotingDispatchKey = (election) => {
  const votingStartAt = election?.timeline?.votingStartAt
  if (!votingStartAt) return ""
  const parsedDate = new Date(votingStartAt)
  return Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString()
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
  if (election?.status !== "published") return false

  const votingWindow = hasValidVotingWindow(election)
  if (!votingWindow) return false

  const { votingStartAt } = votingWindow

  return now.getTime() >= votingStartAt.getTime() - PRE_VOTING_EMAIL_WINDOW_MS &&
    now.getTime() < votingStartAt.getTime()
}

const isManualDispatchAllowedNow = (election, now = new Date()) => {
  if (election?.status !== "published") return false

  const votingWindow = hasValidVotingWindow(election)
  if (!votingWindow) return false

  const { votingStartAt, votingEndAt } = votingWindow

  return now.getTime() >= votingStartAt.getTime() &&
    now.getTime() < votingEndAt.getTime()
}

const collectEligibleVoterProfiles = async (election) => {
  const allBatches = new Set()
  const allExtraRollNumbers = new Set()

  for (const post of election?.posts || []) {
    for (const batch of normalizeStringArray(post?.voterEligibility?.batches)) {
      allBatches.add(batch)
    }
    for (const rollNumber of normalizeRollNumbers(post?.voterEligibility?.extraRollNumbers)) {
      allExtraRollNumbers.add(rollNumber)
    }
  }

  if (allBatches.size === 0 && allExtraRollNumbers.size === 0) {
    return []
  }

  const query = {
    status: "Active",
    $or: [],
  }
  if (allBatches.size > 0) {
    query.$or.push({ batch: { $in: [...allBatches] } })
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

const processDispatchBatch = async (election, recipients = []) => {
  const results = await Promise.all(recipients.map(async ({ profile, eligiblePosts }) => {
    const userId = profile?.userId?._id || null
    const email = String(profile?.userId?.email || "").trim()
    const rollNumber = String(profile?.rollNumber || "").trim().toUpperCase()

    if (!userId || !email) {
      return {
        success: false,
        error: `${rollNumber || "Unknown voter"} is missing an email address`,
      }
    }

    await invalidateActionLinkTokens(
      {
        type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
        subjectModel: "Election",
        subjectId: election._id,
        recipientUserId: userId,
      },
      "Voting ballot link reissued"
    )

    const { rawToken } = await createActionLinkToken({
      type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
      subjectModel: "Election",
      subjectId: election._id,
      recipientUserId: userId,
      recipientEmail: email,
      payload: {
        electionId: String(election._id),
        dispatchKey: getVotingDispatchKey(election),
      },
      expiresAt: new Date(election.timeline.votingEndAt),
    })

    const emailResult = await emailService.sendElectionVotingBallotEmail({
      email,
      studentName: profile?.userId?.name || "",
      electionTitle: election.title,
      votingStartAt: new Date(election.timeline.votingStartAt).toLocaleString(),
      votingEndAt: new Date(election.timeline.votingEndAt).toLocaleString(),
      postCount: eligiblePosts.length,
      ballotToken: rawToken,
    })

    if (!emailResult?.success) {
      await invalidateActionLinkTokens(
        {
          type: ACTION_LINK_TOKEN_TYPE.ELECTION_VOTING_BALLOT,
          subjectModel: "Election",
          subjectId: election._id,
          recipientUserId: userId,
        },
        "Voting ballot email delivery failed"
      )
      return {
        success: false,
        error: `${rollNumber || "Unknown voter"}: ${emailResult?.error || "Failed to send voting email"}`,
      }
    }

    return { success: true }
  }))

  return results.reduce(
    (acc, result) => {
      if (result.success) {
        acc.sent += 1
      } else {
        acc.failed += 1
        acc.errors.push(result.error)
      }
      return acc
    },
    {
      sent: 0,
      failed: 0,
      errors: [],
    }
  )
}

export const triggerElectionVotingEmailDispatchForElection = async (electionId, reason = "manual") => {
  const activeDispatchKey = String(electionId || "")
  if (!activeDispatchKey || activeDispatches.has(activeDispatchKey)) {
    return false
  }

  activeDispatches.add(activeDispatchKey)

  const election = await Election.findById(electionId)
  const canDispatch = reason === "manual"
    ? isManualDispatchAllowedNow(election)
    : isAutomaticDispatchDueNow(election)

  if (!election || !canDispatch) {
    return false
  }

  const dispatchKey = getVotingDispatchKey(election)
  if (!dispatchKey) {
    return false
  }

  const existingDispatchKey = String(election?.votingEmailDispatch?.dispatchKey || "")
  const existingStatus = String(election?.votingEmailDispatch?.status || "idle")

  if (
    existingDispatchKey === dispatchKey &&
    (
      existingStatus === "running" ||
      (reason !== "manual" && ["completed", "failed"].includes(existingStatus))
    )
  ) {
    return false
  }
  try {
    const eligibleProfiles = await collectEligibleVoterProfiles(election)
    const verifiedNominations = await ElectionNomination.find({
      electionId: election._id,
      status: "verified",
    }).select("postId")
    const verifiedPostIds = new Set(verifiedNominations.map((nomination) => String(nomination.postId)))
    const voterIdsWithVotes = new Set(
      (await ElectionVote.distinct("voterUserId", { electionId: election._id })).map((value) => String(value))
    )
    const recipients = eligibleProfiles
      .map(({ profile, eligiblePosts }) => ({
        profile,
        eligiblePosts: eligiblePosts.filter((post) => verifiedPostIds.has(String(post._id))),
      }))
      .filter(
        ({ profile, eligiblePosts }) =>
          eligiblePosts.length > 0 && !voterIdsWithVotes.has(String(profile?.userId?._id || ""))
      )

    election.votingEmailDispatch = {
      dispatchKey,
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      lastTriggeredAt: new Date(),
      totalRecipients: recipients.length,
      sentRecipients: 0,
      failedRecipients: 0,
      lastError: "",
    }
    await election.save()
    emitVotingDispatchUpdate(election)

    let sentRecipients = 0
    let failedRecipients = 0
    const errors = []

    for (let index = 0; index < recipients.length; index += EMAIL_BATCH_SIZE) {
      const batch = recipients.slice(index, index + EMAIL_BATCH_SIZE)
      const batchResult = await processDispatchBatch(election, batch)
      sentRecipients += batchResult.sent
      failedRecipients += batchResult.failed
      errors.push(...batchResult.errors)

      election.votingEmailDispatch = {
        ...election.votingEmailDispatch,
        dispatchKey,
        status: "running",
        lastTriggeredAt: new Date(),
        totalRecipients: recipients.length,
        sentRecipients,
        failedRecipients,
        lastError: errors[0] || "",
      }
      await election.save()
      emitVotingDispatchUpdate(election)
    }

    election.votingEmailDispatch = {
      ...election.votingEmailDispatch,
      dispatchKey,
      status: failedRecipients > 0 ? "failed" : "completed",
      completedAt: new Date(),
      lastTriggeredAt: new Date(),
      totalRecipients: recipients.length,
      sentRecipients,
      failedRecipients,
      lastError: errors[0] || "",
    }
    await election.save()
    emitVotingDispatchUpdate(election)

    return true
  } catch (error) {
    const failedElection = await Election.findByIdAndUpdate(electionId, {
      $set: {
        "votingEmailDispatch.dispatchKey": dispatchKey,
        "votingEmailDispatch.status": "failed",
        "votingEmailDispatch.completedAt": new Date(),
        "votingEmailDispatch.lastTriggeredAt": new Date(),
        "votingEmailDispatch.lastError": error?.message || "Voting email dispatch failed",
      },
    }, { new: true })
    emitVotingDispatchUpdate(failedElection)
    return false
  } finally {
    activeDispatches.delete(activeDispatchKey)
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
