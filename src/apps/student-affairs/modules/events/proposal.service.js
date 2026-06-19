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
import ActivityCalendar from "../../../../models/event/ActivityCalendar.model.js"
import ApprovalLog from "../../../../models/event/ApprovalLog.model.js"
import { auditService } from "../../../../services/audit/audit.service.js"
import { pickFields } from "../../../../utils/objectDiff.js"
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
import {
  clearCustomApprovalAssignments,
  getCustomAssignmentState,
  normalizeObjectId,
  resolvePostStudentAffairsAssignments,
} from "./approval-assignments.utils.js"
import { notifyStageApprovers, notifySubmitterByEmail } from "./approval-email.utils.js"

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

    if (!isMegaEvent && event.calendarId) {
      const calendar = await ActivityCalendar.findById(event.calendarId).select(
        "status allowProposalBeforeApproval academicYear"
      )

      if (
        calendar &&
        calendar.status !== "approved" &&
        !calendar.allowProposalBeforeApproval
      ) {
        return badRequest(
          `Proposal can be submitted only after the ${calendar.academicYear} activity calendar is approved, unless Admin enables early proposal submission for that calendar`
        )
      }
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
      customApprovalAssignments: [],
      currentApproverUser: null,
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

    // Audit: data-mutation record of the proposal's initial content
    await auditService.recordCreate({
      entityType: "EventProposal",
      entityId: proposal._id,
      snapshot: proposalPayload,
      actor: user,
      feature: "gymkhana-events",
    })

    // Notify the first approver stage that a proposal awaits review
    const submitContext = await this._proposalLinkContext(proposal)
    await notifyStageApprovers({
      entityType: "EventProposal",
      entityId: proposal._id,
      entityLabel: submitContext.label,
      stage: STATUS_TO_APPROVER[proposal.status],
      assignedUserId: proposal.currentApproverUser || null,
      linkParams: submitContext.linkParams,
      movedBy: user.name,
      movedByStage: isPresident ? APPROVAL_STAGES.PRESIDENT_GYMKHANA : APPROVAL_STAGES.GS_GYMKHANA,
    })

    return created({ proposal }, "Proposal submitted successfully")
  }

  /**
   * Build the deep-link context (label + params) for a proposal's event.
   */
  async _proposalLinkContext(proposal) {
    const event = await GymkhanaEvent.findById(proposal.eventId).select(
      "title isMegaEvent megaEventSeriesId calendarId"
    )
    const label = event?.title || "Gymkhana Event Proposal"
    if (!event) return { label, linkParams: {} }
    if (event.isMegaEvent || event.megaEventSeriesId) {
      return { label, linkParams: { isMegaEvent: true, seriesId: event.megaEventSeriesId, occurrenceId: event._id } }
    }
    let academicYear = ""
    if (event.calendarId) {
      const calendar = await ActivityCalendar.findById(event.calendarId).select("academicYear")
      academicYear = calendar?.academicYear || ""
    }
    return { label, linkParams: { isMegaEvent: false, eventId: event._id, academicYear } }
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
    const trackedFields = Object.keys(proposalPayload)
    const beforeSnapshot = pickFields(proposal.toObject(), trackedFields)
    Object.assign(proposal, proposalPayload)

    if (isGS) {
      proposal.status = PROPOSAL_STATUS.PENDING_PRESIDENT
      proposal.currentApprovalStage = APPROVAL_STAGES.PRESIDENT_GYMKHANA
      proposal.customApprovalChain = []
      proposal.currentChainIndex = null
      clearCustomApprovalAssignments(proposal)
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
      clearCustomApprovalAssignments(proposal)
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

    // Audit: field-level diff of the edited proposal content
    await auditService.recordUpdate({
      entityType: "EventProposal",
      entityId: proposal._id,
      before: beforeSnapshot,
      after: pickFields(proposal.toObject(), trackedFields),
      fields: trackedFields,
      actor: user,
      feature: "gymkhana-events",
    })

    return success(
      { proposal },
      200,
      isGS ? "Proposal resubmitted successfully" : "Proposal updated successfully"
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN OVERRIDE OPERATIONS (Admin / Super Admin)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Admin override edit (surgical): correct proposal content WITHOUT changing
   * its approval status/stage. Requires a reason; the field-level diff + reason
   * are recorded in the audit log.
   */
  async adminUpdateProposal(proposalId, data, user) {
    const { reason, ...fields } = data || {}

    const proposal = await this.model.findById(proposalId)
    if (!proposal) {
      return notFound("Proposal")
    }

    const event = await GymkhanaEvent.findById(proposal.eventId)
    if (!event) {
      return notFound("Event")
    }

    const payload = this._prepareProposalPayload(fields, event, proposal)
    const trackedFields = Object.keys(payload)
    const beforeSnapshot = pickFields(proposal.toObject(), trackedFields)

    Object.assign(proposal, payload)
    await proposal.save()

    await auditService.recordUpdate({
      entityType: "EventProposal",
      entityId: proposal._id,
      before: beforeSnapshot,
      after: pickFields(proposal.toObject(), trackedFields),
      fields: trackedFields,
      actor: user,
      reason,
      feature: "gymkhana-events",
    })

    return success({ proposal }, 200, "Proposal updated by admin")
  }

  /**
   * Admin soft-delete (reversible): hide the proposal and unlink it from its
   * event so a fresh proposal can be submitted. Snapshot + reason are audited.
   */
  async adminSoftDeleteProposal(proposalId, reason, user) {
    const proposal = await this.model.findById(proposalId)
    if (!proposal) {
      return notFound("Proposal")
    }

    const contentFields = [
      "proposalText",
      "proposalDocumentUrl",
      "externalGuestsDetails",
      "chiefGuestDocumentUrl",
      "proposalDetails",
      "accommodationRequired",
      "hasRegistrationFee",
      "registrationFeeAmount",
      "totalExpectedIncome",
      "totalExpenditure",
      "status",
    ]
    const snapshot = pickFields(proposal.toObject(), contentFields)

    proposal.isDeleted = true
    proposal.deletedAt = new Date()
    proposal.deletedBy = user._id
    proposal.deleteReason = reason
    await proposal.save()

    const event = await GymkhanaEvent.findById(proposal.eventId)
    if (event && String(event.proposalId) === String(proposal._id)) {
      event.proposalSubmitted = false
      event.proposalId = null
      event.status = EVENT_STATUS.UPCOMING
      await event.save()
    }

    await auditService.recordDelete({
      entityType: "EventProposal",
      entityId: proposal._id,
      snapshot,
      actor: user,
      reason,
      feature: "gymkhana-events",
    })

    return success({ proposalId: proposal._id }, 200, "Proposal deleted")
  }

  /**
   * Admin restore of a soft-deleted proposal. Re-links it to its event.
   */
  async adminRestoreProposal(proposalId, user) {
    const proposal = await this.model
      .findOne({ _id: proposalId })
      .setOptions({ withDeleted: true })
    if (!proposal) {
      return notFound("Proposal")
    }
    if (!proposal.isDeleted) {
      return badRequest("Proposal is not deleted")
    }

    proposal.isDeleted = false
    proposal.deletedAt = null
    proposal.deletedBy = null
    proposal.deleteReason = null
    await proposal.save()

    const event = await GymkhanaEvent.findById(proposal.eventId)
    if (event && !event.proposalId) {
      event.proposalSubmitted = true
      event.proposalId = proposal._id
      event.status =
        proposal.status === PROPOSAL_STATUS.APPROVED
          ? EVENT_STATUS.PROPOSAL_APPROVED
          : EVENT_STATUS.PROPOSAL_SUBMITTED
      await event.save()
    }

    await auditService.recordRestore({
      entityType: "EventProposal",
      entityId: proposal._id,
      snapshot: pickFields(proposal.toObject(), ["status"]),
      actor: user,
      feature: "gymkhana-events",
    })

    return success({ proposal }, 200, "Proposal restored")
  }

  /**
   * List soft-deleted proposals (newest first) for the admin "deleted items" view.
   */
  async listDeletedProposals({ limit = 200 } = {}) {
    const proposals = await this.model
      .find({ isDeleted: true })
      .sort({ deletedAt: -1 })
      .limit(limit)
      .populate("submittedBy", "name email")
      .populate("deletedBy", "name email")
      .populate("eventId", "title category")
      .lean()
    return success({ proposals })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVAL OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Approve proposal
   */
  async approveProposal(
    proposalId,
    comments,
    user,
    nextApprovalStages = [],
    nextApprovers = [],
    directApprove = false
  ) {
    const proposal = await this.model.findById(proposalId)
    if (!proposal) {
      return notFound("Proposal")
    }

    let notifyNextApprover = false
    let nextApproverUserId = null
    let nextApproverStage = null

    const requiredSubRole = STATUS_TO_APPROVER[proposal.status]
    if (!requiredSubRole) {
      return badRequest("Proposal is not pending approval")
    }

    const assignedApproverUserId = normalizeObjectId(proposal.currentApproverUser)
    if (assignedApproverUserId && normalizeObjectId(user._id) !== assignedApproverUserId) {
      return forbidden("Only the assigned approver can approve at this stage")
    }

    if (user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can approve at this stage`)
    }

    const currentStage = user.subRole
    const normalizedComments = String(comments || "").trim()
    const isStudentAffairsReview =
      currentStage === APPROVAL_STAGES.STUDENT_AFFAIRS &&
      (proposal.status === PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS ||
        proposal.status === ProposalService.LEGACY_PENDING_STATUS)
    const hasSelectedNextApprovers =
      (Array.isArray(nextApprovers) && nextApprovers.length > 0) ||
      (Array.isArray(nextApprovalStages) && nextApprovalStages.length > 0)
    let approvalAction = APPROVAL_ACTIONS.APPROVED

    if (isStudentAffairsReview) {
      if (directApprove && hasSelectedNextApprovers) {
        return badRequest(
          "Direct approval from Student Affairs is only allowed when no next recommender is selected"
        )
      }

      if (!directApprove && !hasSelectedNextApprovers) {
        return badRequest(
          "Select at least one next recommender before forwarding from Student Affairs"
        )
      }

      if (directApprove) {
        proposal.status = PROPOSAL_STATUS.APPROVED
        proposal.currentApprovalStage = null
        proposal.currentChainIndex = null
        proposal.currentApproverUser = null
        proposal.customApprovalChain = []
        clearCustomApprovalAssignments(proposal)
      } else {
        const assignmentResolution = await resolvePostStudentAffairsAssignments(
          nextApprovers,
          nextApprovalStages
        )
        if (!assignmentResolution.success) {
          return badRequest(assignmentResolution.message)
        }
        const chain = assignmentResolution.chain
        const firstStage = chain[0]
        const nextStatus = APPROVER_TO_STATUS[firstStage]

        proposal.customApprovalChain = chain
        proposal.customApprovalAssignments = assignmentResolution.assignments
        proposal.currentChainIndex = 0
        proposal.status = nextStatus
        proposal.currentApprovalStage = firstStage
        proposal.currentApproverUser = assignmentResolution.currentApproverUser
        notifyNextApprover = assignmentResolution.assignments.length > 0
        nextApproverUserId = assignmentResolution.currentApproverUser
        nextApproverStage = firstStage
        approvalAction = APPROVAL_ACTIONS.RECOMMENDED
      }
    } else {
      const assignmentState = getCustomAssignmentState(proposal, currentStage)
      const hasAssignedApprovers = assignmentState.hasAssignments

      if (hasAssignedApprovers) {
        if (assignmentState.currentIndex === -1 || !assignmentState.currentAssignment) {
          return badRequest("Assigned approval flow is misconfigured for this proposal")
        }

        const nextAssignment = assignmentState.nextAssignment
        if (!nextAssignment) {
          proposal.status = PROPOSAL_STATUS.APPROVED
          proposal.currentApprovalStage = null
          proposal.currentChainIndex = null
          proposal.currentApproverUser = null
        } else {
          const nextStatus = APPROVER_TO_STATUS[nextAssignment.stage]
          proposal.status = nextStatus
          proposal.currentApprovalStage = nextAssignment.stage
          proposal.currentChainIndex = assignmentState.currentIndex + 1
          proposal.currentApproverUser = normalizeObjectId(nextAssignment.userId)
          notifyNextApprover = true
          nextApproverUserId = normalizeObjectId(nextAssignment.userId)
          nextApproverStage = nextAssignment.stage
        }
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
            proposal.currentApproverUser = null
          } else {
            const nextStatus = APPROVER_TO_STATUS[nextStage]
            proposal.status = nextStatus
            proposal.currentApprovalStage = nextStage
            proposal.currentChainIndex = currentIndex + 1
            proposal.currentApproverUser = null
          }
        } else {
          // Legacy/default flow fallback
          const nextStatus = STAGE_TO_STATUS[user.subRole]
          proposal.status = nextStatus
          proposal.currentApproverUser = null
          if (nextStatus === PROPOSAL_STATUS.APPROVED) {
            proposal.currentApprovalStage = null
          } else {
            proposal.currentApprovalStage = STATUS_TO_APPROVER[nextStatus]
          }
        }
      }
    }

    if (proposal.status === PROPOSAL_STATUS.APPROVED) {
      proposal.approvedAt = new Date()
      proposal.currentApprovalStage = null
      proposal.currentChainIndex = null
      proposal.currentApproverUser = null

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
      action: approvalAction,
      performedBy: user._id,
      comments: normalizedComments,
    })

    // Email whoever must act at the proposal's new stage (assigned user, else all sub-role holders)
    if (
      proposal.status !== PROPOSAL_STATUS.APPROVED &&
      proposal.status !== PROPOSAL_STATUS.REJECTED &&
      proposal.status !== PROPOSAL_STATUS.REVISION_REQUESTED
    ) {
      const approveContext = await this._proposalLinkContext(proposal)
      await notifyStageApprovers({
        entityType: "EventProposal",
        entityId: proposal._id,
        entityLabel: approveContext.label,
        stage: STATUS_TO_APPROVER[proposal.status],
        assignedUserId: proposal.currentApproverUser || null,
        linkParams: approveContext.linkParams,
        movedBy: user.name,
        movedByStage: currentStage,
        comments: normalizedComments,
      })
    }

    return success(
      { proposal },
      200,
      approvalAction === APPROVAL_ACTIONS.RECOMMENDED
        ? "Proposal recommended"
        : "Proposal approved"
    )
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

    const assignedApproverUserId = normalizeObjectId(proposal.currentApproverUser)
    if (assignedApproverUserId && normalizeObjectId(user._id) !== assignedApproverUserId) {
      return forbidden("Only the assigned approver can reject at this stage")
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
    clearCustomApprovalAssignments(proposal)
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

    // Notify the submitter that their proposal was rejected
    const rejectContext = await this._proposalLinkContext(proposal)
    await notifySubmitterByEmail({
      entityType: "EventProposal",
      entityId: proposal._id,
      entityLabel: rejectContext.label,
      submitterUserId: proposal.submittedBy,
      action: "rejected",
      actorName: user.name,
      actorStage: currentStage,
      comments: reason,
      linkParams: rejectContext.linkParams,
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

    const assignedApproverUserId = normalizeObjectId(proposal.currentApproverUser)
    if (assignedApproverUserId && normalizeObjectId(user._id) !== assignedApproverUserId) {
      return forbidden("Only the assigned approver can request revision at this stage")
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
    clearCustomApprovalAssignments(proposal)
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

    // Notify the submitter that changes are required
    const revisionContext = await this._proposalLinkContext(proposal)
    await notifySubmitterByEmail({
      entityType: "EventProposal",
      entityId: proposal._id,
      entityLabel: revisionContext.label,
      submitterUserId: proposal.submittedBy,
      action: "revision_requested",
      actorName: user.name,
      actorStage: currentStage,
      comments,
      linkParams: revisionContext.linkParams,
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
      [SUBROLES.OFFICER_SA]: PROPOSAL_STATUS.PENDING_OFFICER,
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

    const proposals = await this.model.find({
      ...filter,
      $or: [
        { currentApproverUser: user._id },
        { currentApproverUser: null },
        { currentApproverUser: { $exists: false } },
      ],
    })
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
          "Student Affairs must select at least one next approval stage (Officer SA / Associate Dean SA / Dean SA)",
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
