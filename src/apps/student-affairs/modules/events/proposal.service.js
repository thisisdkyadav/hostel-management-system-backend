/**
 * @fileoverview Proposal Service
 * @description Business logic for Event Proposals (21 days before event)
 */

import { BaseService } from "../../../../services/base/BaseService.js"
import {
  success,
  created,
  notFound,
  badRequest,
  forbidden,
} from "../../../../services/base/ServiceResponse.js"
import EventProposal from "../../../../models/event/EventProposal.model.js"
import GymkhanaEvent from "../../../../models/event/GymkhanaEvent.model.js"
import ApprovalLog from "../../../../models/event/ApprovalLog.model.js"
import {
  PROPOSAL_STATUS,
  EVENT_STATUS,
  APPROVAL_STAGES,
  STAGE_TO_STATUS,
  STATUS_TO_APPROVER,
  APPROVER_TO_STATUS,
  APPROVAL_ACTIONS,
  POST_STUDENT_AFFAIRS_APPROVERS,
} from "./events.constants.js"
import { SUBROLES } from "../../../../core/constants/roles.constants.js"

class ProposalService extends BaseService {
  constructor() {
    super(EventProposal, "EventProposal")
  }

  static LEGACY_PENDING_STATUS = "pending"

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATE & UPDATE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create/submit a proposal for an event.
   * - Standard events: GS submits -> President approval starts.
   * - Mega events: President submits -> Student Affairs approval starts.
   */
  async createProposal(eventId, data, user) {
    const isGS = user.subRole === SUBROLES.GS_GYMKHANA
    const isPresident = user.subRole === SUBROLES.PRESIDENT_GYMKHANA
    if (!isGS && !isPresident) {
      return forbidden("Only GS or President Gymkhana can submit proposals")
    }

    const event = await GymkhanaEvent.findById(eventId)
    if (!event) {
      return notFound("Event")
    }

    const isMegaEvent = Boolean(event.megaEventSeriesId)
    if (!isMegaEvent && !isGS) {
      return forbidden("Only GS Gymkhana can submit proposals for standard events")
    }
    if (isMegaEvent && !isPresident) {
      return forbidden("Only President Gymkhana can submit proposals for mega events")
    }

    if (event.proposalSubmitted) {
      return badRequest("Proposal already submitted for this event")
    }

    if (event.status === EVENT_STATUS.CANCELLED || event.status === EVENT_STATUS.COMPLETED) {
      return badRequest("Proposal cannot be submitted for cancelled or completed events")
    }

    const proposalDueDate = await this._ensureEventProposalDueDate(event)

    const todayStart = this._toStartOfDay(new Date())
    const dueDateStart = this._toStartOfDay(proposalDueDate)
    if (dueDateStart && todayStart && todayStart < dueDateStart) {
      return badRequest(
        `Proposal can be submitted on or after ${proposalDueDate.toLocaleDateString()}`
      )
    }

    const proposalPayload = this._prepareProposalPayload(data, event)
    const startsAtStudentAffairs = isMegaEvent && isPresident

    // Create proposal
    const proposal = await this.model.create({
      eventId,
      submittedBy: user._id,
      ...proposalPayload,
      status: startsAtStudentAffairs
        ? PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS
        : PROPOSAL_STATUS.PENDING_PRESIDENT,
      currentApprovalStage: startsAtStudentAffairs
        ? APPROVAL_STAGES.STUDENT_AFFAIRS
        : APPROVAL_STAGES.PRESIDENT_GYMKHANA,
      customApprovalChain: [],
      currentChainIndex: null,
    })

    // Update event
    event.proposalSubmitted = true
    event.proposalId = proposal._id
    event.status = EVENT_STATUS.PROPOSAL_SUBMITTED
    await event.save()

    // Log submission
    await ApprovalLog.create({
      entityType: "EventProposal",
      entityId: proposal._id,
      stage: isPresident ? APPROVAL_STAGES.PRESIDENT_GYMKHANA : APPROVAL_STAGES.GS_GYMKHANA,
      action: APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
    })

    return created({ proposal }, "Proposal submitted successfully")
  }

  /**
   * Update proposal
   * GS: after revision request or rejection
   * President: while pending president approval
   */
  async updateProposal(proposalId, data, user) {
    const isGS = user.subRole === SUBROLES.GS_GYMKHANA
    const isPresident = user.subRole === SUBROLES.PRESIDENT_GYMKHANA

    if (!isGS && !isPresident) {
      return forbidden("Only GS or President Gymkhana can update proposals")
    }

    const proposal = await this.model.findById(proposalId)
    if (!proposal) {
      return notFound("Proposal")
    }

    const gsEditableStatuses = [
      PROPOSAL_STATUS.REVISION_REQUESTED,
      PROPOSAL_STATUS.REJECTED,
    ]

    if (isGS && !gsEditableStatuses.includes(proposal.status)) {
      return badRequest("GS can only update proposals after revision request or rejection")
    }

    const event = await GymkhanaEvent.findById(proposal.eventId)
    if (!event) {
      return notFound("Event")
    }
    const isMegaEvent = Boolean(event.megaEventSeriesId)

    if (isPresident) {
      if (isMegaEvent) {
        const presidentEditableStatuses = [
          PROPOSAL_STATUS.PENDING_PRESIDENT,
          PROPOSAL_STATUS.REVISION_REQUESTED,
          PROPOSAL_STATUS.REJECTED,
        ]
        if (!presidentEditableStatuses.includes(proposal.status)) {
          return badRequest("President can only update mega event proposals before/after review feedback")
        }
      } else if (proposal.status !== PROPOSAL_STATUS.PENDING_PRESIDENT) {
        return badRequest("President can only update proposals pending President approval")
      }
    }

    const previousStatus = proposal.status
    const proposalPayload = this._prepareProposalPayload(data, event, proposal)
    Object.assign(proposal, proposalPayload)

    if (isGS) {
      proposal.status = PROPOSAL_STATUS.PENDING_PRESIDENT
      proposal.currentApprovalStage = APPROVAL_STAGES.PRESIDENT_GYMKHANA
      proposal.customApprovalChain = []
      proposal.currentChainIndex = null
      proposal.revisionCount += 1
      proposal.rejectionReason = null
      proposal.rejectedBy = null
      proposal.rejectedAt = null
    } else if (isPresident) {
      proposal.status = isMegaEvent
        ? PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS
        : PROPOSAL_STATUS.PENDING_PRESIDENT
      proposal.currentApprovalStage = isMegaEvent
        ? APPROVAL_STAGES.STUDENT_AFFAIRS
        : APPROVAL_STAGES.PRESIDENT_GYMKHANA
      proposal.customApprovalChain = []
      proposal.currentChainIndex = null
      if (previousStatus === PROPOSAL_STATUS.REVISION_REQUESTED || previousStatus === PROPOSAL_STATUS.REJECTED) {
        proposal.revisionCount += 1
      }
      proposal.rejectionReason = null
      proposal.rejectedBy = null
      proposal.rejectedAt = null
    }

    await proposal.save()

    // Log update/resubmission
    await ApprovalLog.create({
      entityType: "EventProposal",
      entityId: proposal._id,
      stage: user.subRole,
      action: APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
      comments: isGS
        ? `Revision #${proposal.revisionCount}`
        : "Updated by President before approval",
    })

    return success(
      { proposal },
      200,
      isGS ? "Proposal resubmitted successfully" : "Proposal updated successfully"
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVAL OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Approve proposal
   */
  async approveProposal(proposalId, comments, user, nextApprovalStages = []) {
    const proposal = await this.model.findById(proposalId)
    if (!proposal) {
      return notFound("Proposal")
    }

    const requiredSubRole = STATUS_TO_APPROVER[proposal.status]
    if (!requiredSubRole) {
      return badRequest("Proposal is not pending approval")
    }

    if (user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can approve at this stage`)
    }

    const currentStage = user.subRole
    const isStudentAffairsReview =
      currentStage === APPROVAL_STAGES.STUDENT_AFFAIRS &&
      (proposal.status === PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS ||
        proposal.status === ProposalService.LEGACY_PENDING_STATUS)

    if (isStudentAffairsReview) {
      const chainValidation = this._validatePostStudentAffairsChain(nextApprovalStages)
      if (!chainValidation.success) {
        return badRequest(chainValidation.message)
      }
      const chain = chainValidation.chain
      const firstStage = chain[0]
      const nextStatus = APPROVER_TO_STATUS[firstStage]

      proposal.customApprovalChain = chain
      proposal.currentChainIndex = 0
      proposal.status = nextStatus
      proposal.currentApprovalStage = firstStage
    } else {
      const chain = Array.isArray(proposal.customApprovalChain)
        ? proposal.customApprovalChain
        : []
      const hasCustomChain = chain.length > 0

      if (hasCustomChain) {
        const currentIndex = chain.findIndex((stage) => stage === currentStage)
        if (currentIndex === -1) {
          return badRequest("Approval chain is misconfigured for this proposal")
        }

        const nextStage = chain[currentIndex + 1]
        if (!nextStage) {
          proposal.status = PROPOSAL_STATUS.APPROVED
          proposal.currentApprovalStage = null
          proposal.currentChainIndex = null
        } else {
          const nextStatus = APPROVER_TO_STATUS[nextStage]
          proposal.status = nextStatus
          proposal.currentApprovalStage = nextStage
          proposal.currentChainIndex = currentIndex + 1
        }
      } else {
        // Legacy/default flow fallback
        const nextStatus = STAGE_TO_STATUS[user.subRole]
        proposal.status = nextStatus
        if (nextStatus === PROPOSAL_STATUS.APPROVED) {
          proposal.currentApprovalStage = null
        } else {
          proposal.currentApprovalStage = STATUS_TO_APPROVER[nextStatus]
        }
      }
    }

    if (proposal.status === PROPOSAL_STATUS.APPROVED) {
      proposal.approvedAt = new Date()
      proposal.currentApprovalStage = null
      proposal.currentChainIndex = null

      // Update event status
      await GymkhanaEvent.findByIdAndUpdate(proposal.eventId, {
        status: EVENT_STATUS.PROPOSAL_APPROVED,
      })
    }

    await proposal.save()

    // Log approval
    await ApprovalLog.create({
      entityType: "EventProposal",
      entityId: proposal._id,
      stage: currentStage,
      action: APPROVAL_ACTIONS.APPROVED,
      performedBy: user._id,
      comments,
    })

    return success({ proposal }, 200, "Proposal approved")
  }

  /**
   * Reject proposal
   */
  async rejectProposal(proposalId, reason, user) {
    const proposal = await this.model.findById(proposalId)
    if (!proposal) {
      return notFound("Proposal")
    }

    const requiredSubRole = STATUS_TO_APPROVER[proposal.status]
    if (!requiredSubRole) {
      return badRequest("Proposal is not pending approval")
    }

    if (user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can reject at this stage`)
    }

    const currentStage = user.subRole

    proposal.status = PROPOSAL_STATUS.REJECTED
    proposal.rejectionReason = reason
    proposal.rejectedBy = user._id
    proposal.rejectedAt = new Date()
    proposal.currentApprovalStage = null
    proposal.customApprovalChain = []
    proposal.currentChainIndex = null
    await proposal.save()

    // Log rejection
    await ApprovalLog.create({
      entityType: "EventProposal",
      entityId: proposal._id,
      stage: currentStage,
      action: APPROVAL_ACTIONS.REJECTED,
      performedBy: user._id,
      comments: reason,
    })

    return success({ proposal }, 200, "Proposal rejected")
  }

  /**
   * Request revision on proposal
   */
  async requestRevision(proposalId, comments, user) {
    const proposal = await this.model.findById(proposalId)
    if (!proposal) {
      return notFound("Proposal")
    }

    const requiredSubRole = STATUS_TO_APPROVER[proposal.status]
    if (!requiredSubRole) {
      return badRequest("Proposal is not pending approval")
    }

    if (user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can request revision at this stage`)
    }

    const currentStage = user.subRole

    const event = await GymkhanaEvent.findById(proposal.eventId).select("megaEventSeriesId")
    const isMegaEvent = Boolean(event?.megaEventSeriesId)

    proposal.status = PROPOSAL_STATUS.REVISION_REQUESTED
    proposal.rejectionReason = comments
    proposal.rejectedBy = user._id
    proposal.currentApprovalStage = isMegaEvent
      ? APPROVAL_STAGES.PRESIDENT_GYMKHANA
      : APPROVAL_STAGES.GS_GYMKHANA
    proposal.customApprovalChain = []
    proposal.currentChainIndex = null
    await proposal.save()

    // Log revision request
    await ApprovalLog.create({
      entityType: "EventProposal",
      entityId: proposal._id,
      stage: currentStage,
      action: APPROVAL_ACTIONS.REVISION_REQUESTED,
      performedBy: user._id,
      comments,
    })

    return success({ proposal }, 200, "Revision requested")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READ OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get proposal by ID
   */
  async getProposalById(proposalId) {
    const proposal = await this.model.findById(proposalId)
      .populate("eventId")
      .populate("submittedBy", "name email")
      .populate("rejectedBy", "name email")

    if (!proposal) {
      return notFound("Proposal")
    }

    return success({ proposal })
  }

  /**
   * Get proposal for an event
   */
  async getProposalByEvent(eventId) {
    const proposal = await this.model.findOne({ eventId })
      .populate("eventId")
      .populate("submittedBy", "name email")
      .populate("rejectedBy", "name email")

    if (!proposal) {
      return notFound("Proposal")
    }

    return success({ proposal })
  }

  /**
   * Get events needing proposals (for GS dashboard)
   */
  async getPendingProposals(daysUntilDue = 21) {
    const today = new Date()
    const cutoffDate = new Date()
    cutoffDate.setDate(today.getDate() + daysUntilDue)

    const events = await GymkhanaEvent.find({
      proposalSubmitted: false,
      isMegaEvent: false,
      scheduledStartDate: { $gte: today, $lte: cutoffDate },
      status: { $nin: [EVENT_STATUS.CANCELLED, EVENT_STATUS.COMPLETED] },
    }).sort({ proposalDueDate: 1 })

    const enrichedEvents = events.map((event) => {
      const serialized = event.toObject()
      const startDate = new Date(event.scheduledStartDate)
      const dueDate = this._getProposalDueDate(event)
      const millisecondsPerDay = 1000 * 60 * 60 * 24

      return {
        ...serialized,
        daysUntilEventStart: Math.ceil((startDate - today) / millisecondsPerDay),
        daysUntilProposalDue: dueDate ? Math.ceil((dueDate - today) / millisecondsPerDay) : null,
        isProposalWindowOpen: dueDate
          ? this._toStartOfDay(today) >= this._toStartOfDay(dueDate)
          : false,
      }
    })

    return success({ events: enrichedEvents, count: enrichedEvents.length })
  }

  /**
   * Get proposals pending user's approval
   */
  async getProposalsForApproval(user) {
    const statusMap = {
      [SUBROLES.PRESIDENT_GYMKHANA]: PROPOSAL_STATUS.PENDING_PRESIDENT,
      [SUBROLES.STUDENT_AFFAIRS]: PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS,
      [SUBROLES.JOINT_REGISTRAR_SA]: PROPOSAL_STATUS.PENDING_JOINT_REGISTRAR,
      [SUBROLES.ASSOCIATE_DEAN_SA]: PROPOSAL_STATUS.PENDING_ASSOCIATE_DEAN,
      [SUBROLES.DEAN_SA]: PROPOSAL_STATUS.PENDING_DEAN,
    }

    const assignedStatus = statusMap[user.subRole]
    if (!assignedStatus) {
      return success({ proposals: [] })
    }

    const filter =
      assignedStatus === PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS
        ? { status: { $in: [ProposalService.LEGACY_PENDING_STATUS, assignedStatus] } }
        : { status: assignedStatus }

    const proposals = await this.model.find(filter)
      .populate("eventId")
      .populate("submittedBy", "name email")
      .sort({ createdAt: -1 })

    return success({ proposals })
  }

  /**
   * Get approval history for a proposal
   */
  async getApprovalHistory(proposalId) {
    const logs = await ApprovalLog.find({
      entityType: "EventProposal",
      entityId: proposalId,
    })
      .sort({ createdAt: 1 })
      .populate("performedBy", "name email subRole")

    return success({ history: logs })
  }

  _prepareProposalPayload(data, event, existingProposal = null) {
    const hasValue = (key) => Object.prototype.hasOwnProperty.call(data || {}, key)
    const proposalText = hasValue("proposalText")
      ? data.proposalText
      : existingProposal?.proposalText
    const proposalDocumentUrl = hasValue("proposalDocumentUrl")
      ? data.proposalDocumentUrl
      : existingProposal?.proposalDocumentUrl
    const externalGuestsDetails = hasValue("externalGuestsDetails")
      ? data.externalGuestsDetails
      : existingProposal?.externalGuestsDetails
    const chiefGuestDocumentUrl = hasValue("chiefGuestDocumentUrl")
      ? data.chiefGuestDocumentUrl
      : existingProposal?.chiefGuestDocumentUrl
    const proposalDetails = hasValue("proposalDetails")
      ? data.proposalDetails
      : existingProposal?.proposalDetails
    const accommodationRequired = hasValue("accommodationRequired")
      ? Boolean(data.accommodationRequired)
      : Boolean(existingProposal?.accommodationRequired)
    const hasRegistrationFee = hasValue("hasRegistrationFee")
      ? Boolean(data.hasRegistrationFee)
      : Boolean(existingProposal?.hasRegistrationFee)
    const registrationFeeAmountRaw = hasValue("registrationFeeAmount")
      ? data.registrationFeeAmount
      : existingProposal?.registrationFeeAmount
    const totalExpectedIncomeRaw = hasValue("totalExpectedIncome")
      ? data.totalExpectedIncome
      : existingProposal?.totalExpectedIncome
    const totalExpenditureRaw = hasValue("totalExpenditure")
      ? data.totalExpenditure
      : existingProposal?.totalExpenditure

    const registrationFeeAmount = hasRegistrationFee ? Number(registrationFeeAmountRaw || 0) : 0
    const totalExpectedIncome = Number(totalExpectedIncomeRaw || 0)
    const totalExpenditure = Number(totalExpenditureRaw || 0)
    const eventBudgetAtSubmission = Number(event?.estimatedBudget || 0)
    const budgetDeflection = totalExpenditure - eventBudgetAtSubmission

    return {
      proposalText: proposalText?.trim(),
      proposalDocumentUrl: proposalDocumentUrl?.trim() || "",
      externalGuestsDetails: externalGuestsDetails?.trim() || "",
      chiefGuestDocumentUrl: chiefGuestDocumentUrl?.trim() || "",
      proposalDetails: proposalDetails || null,
      accommodationRequired,
      hasRegistrationFee,
      registrationFeeAmount,
      totalExpectedIncome,
      totalExpenditure,
      budgetDeflection,
      eventBudgetAtSubmission,
    }
  }

  _getProposalDueDate(event) {
    if (event?.proposalDueDate) {
      const existingDueDate = new Date(event.proposalDueDate)
      if (!Number.isNaN(existingDueDate.getTime())) {
        return existingDueDate
      }
    }

    const startDate = new Date(event?.scheduledStartDate)
    if (Number.isNaN(startDate.getTime())) {
      return null
    }

    const dueDate = new Date(startDate)
    dueDate.setDate(dueDate.getDate() - 21)
    return dueDate
  }

  async _ensureEventProposalDueDate(event) {
    const dueDate = this._getProposalDueDate(event)

    if (!dueDate) {
      return null
    }

    if (!event.proposalDueDate || Number.isNaN(new Date(event.proposalDueDate).getTime())) {
      event.proposalDueDate = dueDate
      await event.save()
    }

    return dueDate
  }

  _toStartOfDay(dateValue) {
    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) {
      return null
    }
    date.setHours(0, 0, 0, 0)
    return date
  }

  _validatePostStudentAffairsChain(nextApprovalStages = []) {
    if (!Array.isArray(nextApprovalStages) || nextApprovalStages.length === 0) {
      return {
        success: false,
        message:
          "Student Affairs must select at least one next approval stage (Joint Registrar SA / Associate Dean SA / Dean SA)",
      }
    }

    const uniqueStages = [...new Set(nextApprovalStages)]
    if (uniqueStages.length !== nextApprovalStages.length) {
      return {
        success: false,
        message: "Next approval stages must be unique",
      }
    }

    const invalidStage = uniqueStages.find(
      (stage) => !POST_STUDENT_AFFAIRS_APPROVERS.includes(stage)
    )
    if (invalidStage) {
      return {
        success: false,
        message: `Invalid approval stage selected: ${invalidStage}`,
      }
    }

    return { success: true, chain: uniqueStages }
  }
}

export const proposalService = new ProposalService()
export default proposalService
