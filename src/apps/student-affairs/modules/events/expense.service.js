/**
 * @fileoverview Expense Service
 * @description Business logic for post-event expense submission
 */

import {
  success,
  created,
  notFound,
  badRequest,
  forbidden,
} from "../../../../services/base/ServiceResponse.js"
import { eventExpenseOwner } from "../../../../services/gymkhana/eventExpenseOwner.service.js"
import { eventExpenseQueries } from "../../../../services/gymkhana/eventExpenseQueries.service.js"
import { gymkhanaEventOwner } from "../../../../services/gymkhana/gymkhanaEventOwner.service.js"
import { gymkhanaEventQueries } from "../../../../services/gymkhana/gymkhanaEventQueries.service.js"
import { eventProposalQueries } from "../../../../services/gymkhana/eventProposalQueries.service.js"
import { activityCalendarQueries } from "../../../../services/gymkhana/activityCalendarQueries.service.js"
import { approvalLogOwner } from "../../../../services/gymkhana/approvalLogOwner.service.js"
import { approvalLogQueries } from "../../../../services/gymkhana/approvalLogQueries.service.js"
import { auditService } from "../../../../services/audit/audit.service.js"
import { pickFields } from "../../../../utils/objectDiff.js"
import {
  EVENT_STATUS,
  EXPENSE_APPROVAL_STATUS,
  APPROVAL_STAGES,
  STATUS_TO_APPROVER,
  APPROVER_TO_STATUS,
  STAGE_TO_STATUS,
  APPROVAL_ACTIONS,
  POST_STUDENT_AFFAIRS_APPROVERS,
} from "./events.constants.js"
import { SUBROLES, ROLES } from "../../../../core/constants/roles.constants.js"
import {
  clearCustomApprovalAssignments,
  getCustomAssignmentState,
  normalizeObjectId,
  resolvePostStudentAffairsAssignments,
} from "./approval-assignments.utils.js"
import { notifyStageApprovers, notifySubmitterByEmail } from "./approval-email.utils.js"

class ExpenseService {
  /**
   * Submit expenses for an event (GS only)
   */
  async submitExpense(eventId, data, user) {
    if (user.subRole !== SUBROLES.GS_GYMKHANA) {
      return forbidden("Only GS Gymkhana can submit expenses")
    }

    const event = await gymkhanaEventQueries.findEventById(eventId)
    if (!event) {
      return notFound("Event")
    }

    if (event.status !== EVENT_STATUS.PROPOSAL_APPROVED) {
      return badRequest("Expenses can only be submitted for approved events")
    }

    // Check if expense already exists
    const existing = await eventExpenseQueries.findExpenseByEventId(eventId)
    if (existing) {
      return badRequest("Expenses already submitted for this event")
    }

    // Use proposal expenditure as planned budget snapshot for expense tracking
    const proposal = await eventProposalQueries.findProposalById(event.proposalId)
    const estimatedBudget = proposal?.totalExpenditure || event.estimatedBudget

    const expense = await eventExpenseOwner.createExpense({
      eventId,
      submittedBy: user._id,
      ...data,
      estimatedBudget,
      approvalStatus: EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS,
      currentApprovalStage: APPROVAL_STAGES.STUDENT_AFFAIRS,
      customApprovalChain: [],
      currentChainIndex: null,
      customApprovalAssignments: [],
      currentApproverUser: null,
      rejectionReason: "",
      rejectedBy: null,
      rejectedAt: null,
      approvedBy: null,
      approvedAt: null,
      approvalComments: "",
    })

    // Link event with expense for quick access
    event.expenseId = expense._id
    await gymkhanaEventOwner.persistEvent(event)

    await approvalLogOwner.createLog({
      entityType: "EventExpense",
      entityId: expense._id,
      stage: APPROVAL_STAGES.GS_GYMKHANA,
      action: APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
    })

    // Audit: data-mutation record of the bill's initial content
    await auditService.recordCreate({
      entityType: "EventExpense",
      entityId: expense._id,
      snapshot: { ...data, estimatedBudget },
      actor: user,
      feature: "gymkhana-events",
    })

    const submitContext = await this._expenseLinkContext(expense)
    await notifyStageApprovers({
      entityType: "EventExpense",
      entityId: expense._id,
      entityLabel: submitContext.label,
      stage: STATUS_TO_APPROVER[expense.approvalStatus],
      assignedUserId: expense.currentApproverUser || null,
      linkParams: submitContext.linkParams,
      movedBy: user.name,
      movedByStage: APPROVAL_STAGES.GS_GYMKHANA,
    })

    return created({ expense }, "Expenses submitted successfully")
  }

  /**
   * Build the deep-link context (label + params) for an expense's event.
   */
  async _expenseLinkContext(expense) {
    const event = await gymkhanaEventQueries.findEventByIdLinkFields(expense.eventId)
    const label = event?.title || "Gymkhana Event Bills"
    if (!event) return { label, linkParams: {} }
    if (event.isMegaEvent || event.megaEventSeriesId) {
      return { label, linkParams: { isMegaEvent: true, seriesId: event.megaEventSeriesId, occurrenceId: event._id } }
    }
    let academicYear = ""
    if (event.calendarId) {
      const calendar = await activityCalendarQueries.findCalendarAcademicYear(event.calendarId)
      academicYear = calendar?.academicYear || ""
    }
    return { label, linkParams: { isMegaEvent: false, eventId: event._id, academicYear } }
  }

  /**
   * Update expenses (GS only)
   */
  async updateExpense(expenseId, data, user) {
    if (user.subRole !== SUBROLES.GS_GYMKHANA) {
      return forbidden("Only GS Gymkhana can update expenses")
    }

    const expense = await eventExpenseQueries.findExpenseById(expenseId)
    if (!expense) {
      return notFound("Expense")
    }
    await this._normalizeLegacyPendingStatus(expense)

    if (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
      return badRequest("Approved bills cannot be edited")
    }

    const trackedFields = Object.keys(data || {})
    const beforeSnapshot = pickFields(expense.toObject(), trackedFields)

    Object.assign(expense, data)
    expense.approvalStatus = EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS
    expense.currentApprovalStage = APPROVAL_STAGES.STUDENT_AFFAIRS
    expense.customApprovalChain = []
    expense.currentChainIndex = null
    clearCustomApprovalAssignments(expense)
    expense.rejectionReason = ""
    expense.rejectedBy = null
    expense.rejectedAt = null
    expense.approvedBy = null
    expense.approvedAt = null
    expense.approvalComments = ""
    await eventExpenseOwner.persistExpense(expense)

    // Audit: field-level diff of the edited bill content
    await auditService.recordUpdate({
      entityType: "EventExpense",
      entityId: expense._id,
      before: beforeSnapshot,
      after: pickFields(expense.toObject(), trackedFields),
      fields: trackedFields,
      actor: user,
      feature: "gymkhana-events",
    })

    return success({ expense }, 200, "Expenses updated successfully")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN OVERRIDE OPERATIONS (Admin / Super Admin)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Admin override edit (surgical): correct bill content WITHOUT changing the
   * approval status/stage. Requires a reason; diff + reason are audited.
   */
  async adminUpdateExpense(expenseId, data, user) {
    const { reason, ...payload } = data || {}

    const expense = await eventExpenseQueries.findExpenseById(expenseId)
    if (!expense) {
      return notFound("Expense")
    }

    const trackedFields = Object.keys(payload)
    const beforeSnapshot = pickFields(expense.toObject(), trackedFields)

    Object.assign(expense, payload)
    await eventExpenseOwner.persistExpense(expense)

    await auditService.recordUpdate({
      entityType: "EventExpense",
      entityId: expense._id,
      before: beforeSnapshot,
      after: pickFields(expense.toObject(), trackedFields),
      fields: trackedFields,
      actor: user,
      reason,
      feature: "gymkhana-events",
    })

    return success({ expense }, 200, "Bill updated by admin")
  }

  /**
   * Admin soft-delete (reversible): hide the bill and unlink it from its event.
   */
  async adminSoftDeleteExpense(expenseId, reason, user) {
    const expense = await eventExpenseQueries.findExpenseById(expenseId)
    if (!expense) {
      return notFound("Expense")
    }

    const snapshot = pickFields(expense.toObject(), [
      "bills",
      "eventReportDocumentUrl",
      "notes",
      "totalExpenditure",
      "estimatedBudget",
      "approvalStatus",
    ])

    expense.isDeleted = true
    expense.deletedAt = new Date()
    expense.deletedBy = user._id
    expense.deleteReason = reason
    await eventExpenseOwner.persistExpense(expense)

    const event = await gymkhanaEventQueries.findEventById(expense.eventId)
    if (event && String(event.expenseId) === String(expense._id)) {
      event.expenseId = null
      if (event.status === EVENT_STATUS.COMPLETED) {
        event.status = EVENT_STATUS.PROPOSAL_APPROVED
      }
      await gymkhanaEventOwner.persistEvent(event)
    }

    await auditService.recordDelete({
      entityType: "EventExpense",
      entityId: expense._id,
      snapshot,
      actor: user,
      reason,
      feature: "gymkhana-events",
    })

    return success({ expenseId: expense._id }, 200, "Bill deleted")
  }

  /**
   * Admin restore of a soft-deleted bill. Re-links it to its event.
   */
  async adminRestoreExpense(expenseId, user) {
    const expense = await eventExpenseQueries.findExpenseByIdWithDeleted(expenseId)
    if (!expense) {
      return notFound("Expense")
    }
    if (!expense.isDeleted) {
      return badRequest("Bill is not deleted")
    }

    // Only one active bill per event is allowed (partial-unique on eventId).
    const activeExists = await eventExpenseQueries.findActiveExpenseByEventExcluding(
      expense.eventId,
      expense._id
    )
    if (activeExists) {
      return badRequest("A bill already exists for this event; cannot restore the deleted one")
    }

    expense.isDeleted = false
    expense.deletedAt = null
    expense.deletedBy = null
    expense.deleteReason = null
    await eventExpenseOwner.persistExpense(expense)

    const event = await gymkhanaEventQueries.findEventById(expense.eventId)
    if (event && !event.expenseId) {
      event.expenseId = expense._id
      if (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
        event.status = EVENT_STATUS.COMPLETED
      }
      await gymkhanaEventOwner.persistEvent(event)
    }

    await auditService.recordRestore({
      entityType: "EventExpense",
      entityId: expense._id,
      snapshot: pickFields(expense.toObject(), ["approvalStatus", "totalExpenditure"]),
      actor: user,
      feature: "gymkhana-events",
    })

    return success({ expense }, 200, "Bill restored")
  }

  /**
   * List soft-deleted bills (newest first) for the admin "deleted items" view.
   */
  async listDeletedExpenses({ limit = 200 } = {}) {
    const expenses = await eventExpenseQueries.listDeletedExpenses({ limit })
    return success({ expenses })
  }

  /**
   * Approve expense submission (Admin approval chain)
   */
  async approveExpense(expenseId, comments, user, nextApprovalStages = [], nextApprovers = []) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can approve expenses")
    }

    const expense = await eventExpenseQueries.findExpenseById(expenseId)
    if (!expense) {
      return notFound("Expense")
    }
    await this._normalizeLegacyPendingStatus(expense)

    if (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
      return badRequest("Expense is already approved")
    }

    if (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.REJECTED) {
      return badRequest("Rejected expense must be updated and resubmitted by GS")
    }

    const requiredSubRole = STATUS_TO_APPROVER[expense.approvalStatus]
    if (!requiredSubRole) {
      return badRequest("Expense is not pending approval")
    }

    let notifyNextApprover = false
    let nextApproverUserId = null
    let nextApproverStage = null

    const isSuperAdmin = user.role === ROLES.SUPER_ADMIN
    const normalizedComments = String(comments || "").trim()
    const assignedApproverUserId = normalizeObjectId(expense.currentApproverUser)
    if (assignedApproverUserId && !isSuperAdmin && normalizeObjectId(user._id) !== assignedApproverUserId) {
      return forbidden("Only the assigned approver can approve at this stage")
    }

    if (!isSuperAdmin && user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can approve at this stage`)
    }

    const effectiveStage = isSuperAdmin ? requiredSubRole : user.subRole
    const isStudentAffairsReview =
      effectiveStage === APPROVAL_STAGES.STUDENT_AFFAIRS &&
      (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS ||
        expense.approvalStatus === "pending")

    if (isStudentAffairsReview) {
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

      expense.customApprovalChain = chain
      expense.customApprovalAssignments = assignmentResolution.assignments
      expense.currentChainIndex = 0
      expense.approvalStatus = nextStatus
      expense.currentApprovalStage = firstStage
      expense.currentApproverUser = assignmentResolution.currentApproverUser
      expense.approvedBy = null
      expense.approvedAt = null
      notifyNextApprover = assignmentResolution.assignments.length > 0
      nextApproverUserId = assignmentResolution.currentApproverUser
      nextApproverStage = firstStage
    } else {
      const assignmentState = getCustomAssignmentState(expense, effectiveStage)
      const hasAssignedApprovers = assignmentState.hasAssignments

      if (hasAssignedApprovers) {
        if (assignmentState.currentIndex === -1 || !assignmentState.currentAssignment) {
          return badRequest("Assigned approval flow is misconfigured for this expense")
        }

        const nextAssignment = assignmentState.nextAssignment
        if (!nextAssignment) {
          expense.approvalStatus = EXPENSE_APPROVAL_STATUS.APPROVED
          expense.currentApprovalStage = null
          expense.currentChainIndex = null
          expense.currentApproverUser = null
        } else {
          const nextStatus = APPROVER_TO_STATUS[nextAssignment.stage]
          expense.approvalStatus = nextStatus
          expense.currentApprovalStage = nextAssignment.stage
          expense.currentChainIndex = assignmentState.currentIndex + 1
          expense.currentApproverUser = normalizeObjectId(nextAssignment.userId)
          notifyNextApprover = true
          nextApproverUserId = normalizeObjectId(nextAssignment.userId)
          nextApproverStage = nextAssignment.stage
        }
      } else {
        const chain = Array.isArray(expense.customApprovalChain)
          ? expense.customApprovalChain
          : []
        const hasCustomChain = chain.length > 0

        if (hasCustomChain) {
          const currentIndex = chain.findIndex((stage) => stage === effectiveStage)
          if (currentIndex === -1) {
            return badRequest("Approval chain is misconfigured for this expense")
          }

          const nextStage = chain[currentIndex + 1]
          if (!nextStage) {
            expense.approvalStatus = EXPENSE_APPROVAL_STATUS.APPROVED
            expense.currentApprovalStage = null
            expense.currentChainIndex = null
            expense.currentApproverUser = null
          } else {
            const nextStatus = APPROVER_TO_STATUS[nextStage]
            expense.approvalStatus = nextStatus
            expense.currentApprovalStage = nextStage
            expense.currentChainIndex = currentIndex + 1
            expense.currentApproverUser = null
          }
        } else {
          // Legacy/default fallback
          const nextStatus = STAGE_TO_STATUS[effectiveStage]
          if (!nextStatus || nextStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
            expense.approvalStatus = EXPENSE_APPROVAL_STATUS.APPROVED
            expense.currentApprovalStage = null
            expense.currentChainIndex = null
            expense.currentApproverUser = null
          } else {
            expense.approvalStatus = nextStatus
            expense.currentApprovalStage = STATUS_TO_APPROVER[nextStatus] || null
            expense.currentApproverUser = null
          }
        }
      }
    }

    if (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
      expense.approvedBy = user._id
      expense.approvedAt = new Date()
    }

    expense.approvalComments = normalizedComments
    await eventExpenseOwner.persistExpense(expense)

    await approvalLogOwner.createLog({
      entityType: "EventExpense",
      entityId: expense._id,
      stage: effectiveStage,
      action: APPROVAL_ACTIONS.APPROVED,
      performedBy: user._id,
      comments: normalizedComments,
    })

    // Email whoever must act at the expense's new stage (assigned user, else all sub-role holders)
    if (
      expense.approvalStatus !== EXPENSE_APPROVAL_STATUS.APPROVED &&
      expense.approvalStatus !== EXPENSE_APPROVAL_STATUS.REJECTED
    ) {
      const approveContext = await this._expenseLinkContext(expense)
      await notifyStageApprovers({
        entityType: "EventExpense",
        entityId: expense._id,
        entityLabel: approveContext.label,
        stage: STATUS_TO_APPROVER[expense.approvalStatus],
        assignedUserId: expense.currentApproverUser || null,
        linkParams: approveContext.linkParams,
        movedBy: user.name,
        movedByStage: effectiveStage,
        comments: normalizedComments,
      })
    }

    if (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
      await gymkhanaEventOwner.updateEventById(expense.eventId, {
        status: EVENT_STATUS.COMPLETED,
        expenseId: expense._id,
      })
    }

    return success(
      { expense },
      200,
      expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED
        ? "Expense approved successfully"
        : "Expense moved to next approval stage"
    )
  }

  /**
   * Reject expense submission at current approval stage
   */
  async rejectExpense(expenseId, reason, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can reject expenses")
    }

    const expense = await eventExpenseQueries.findExpenseById(expenseId)
    if (!expense) {
      return notFound("Expense")
    }

    if (
      expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED ||
      expense.approvalStatus === EXPENSE_APPROVAL_STATUS.REJECTED
    ) {
      return badRequest("Expense is already finalized")
    }

    const requiredSubRole = STATUS_TO_APPROVER[expense.approvalStatus]
    if (!requiredSubRole) {
      return badRequest("Expense is not pending approval")
    }

    const isSuperAdmin = user.role === ROLES.SUPER_ADMIN
    const assignedApproverUserId = normalizeObjectId(expense.currentApproverUser)
    if (assignedApproverUserId && !isSuperAdmin && normalizeObjectId(user._id) !== assignedApproverUserId) {
      return forbidden("Only the assigned approver can reject at this stage")
    }

    if (!isSuperAdmin && user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can reject at this stage`)
    }

    const effectiveStage = isSuperAdmin ? requiredSubRole : user.subRole

    expense.approvalStatus = EXPENSE_APPROVAL_STATUS.REJECTED
    expense.currentApprovalStage = null
    expense.customApprovalChain = []
    expense.currentChainIndex = null
    clearCustomApprovalAssignments(expense)
    expense.rejectionReason = reason
    expense.rejectedBy = user._id
    expense.rejectedAt = new Date()
    expense.approvalComments = reason?.trim() || ""
    expense.approvedBy = null
    expense.approvedAt = null
    await eventExpenseOwner.persistExpense(expense)

    await approvalLogOwner.createLog({
      entityType: "EventExpense",
      entityId: expense._id,
      stage: effectiveStage,
      action: APPROVAL_ACTIONS.REJECTED,
      performedBy: user._id,
      comments: reason?.trim() || "",
    })

    // Notify the submitter that their expense was rejected
    const rejectContext = await this._expenseLinkContext(expense)
    await notifySubmitterByEmail({
      entityType: "EventExpense",
      entityId: expense._id,
      entityLabel: rejectContext.label,
      submitterUserId: expense.submittedBy,
      action: "rejected",
      actorName: user.name,
      actorStage: effectiveStage,
      comments: reason,
      linkParams: rejectContext.linkParams,
    })

    return success({ expense }, 200, "Expense rejected")
  }

  /**
   * Get expense by ID
   */
  async getExpenseById(expenseId) {
    const expense = await eventExpenseQueries.findExpenseByIdDetailed(expenseId)

    if (!expense) {
      return notFound("Expense")
    }

    return success({ expense })
  }

  /**
   * Get expense for an event
   */
  async getExpenseByEvent(eventId) {
    const expense = await eventExpenseQueries.findExpenseByEventPopulated(eventId)

    if (!expense) {
      return notFound("Expense")
    }

    return success({ expense })
  }

  /**
   * Get all expenses (for admin view)
   */
  async getAllExpenses(query, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.GYMKHANA) {
      return forbidden("Not authorized to view expenses")
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10))
    const filter = {}

    if (query.status) {
      filter.approvalStatus = query.status
    }

    if (user.role === ROLES.GYMKHANA) {
      filter.submittedBy = user._id
    } else if (user.role === ROLES.ADMIN && user.subRole) {
      const approvalStatusBySubRole = {
        [SUBROLES.STUDENT_AFFAIRS]: EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS,
        [SUBROLES.OFFICER_SA]: EXPENSE_APPROVAL_STATUS.PENDING_OFFICER,
        [SUBROLES.ASSOCIATE_DEAN_SA]: EXPENSE_APPROVAL_STATUS.PENDING_ASSOCIATE_DEAN,
        [SUBROLES.DEAN_SA]: EXPENSE_APPROVAL_STATUS.PENDING_DEAN,
      }

      const assignedStatus = approvalStatusBySubRole[user.subRole]
      if (assignedStatus && !filter.approvalStatus) {
        if (assignedStatus === EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS) {
          filter.approvalStatus = { $in: ["pending", assignedStatus] }
        } else {
          filter.approvalStatus = assignedStatus
        }
      }

      const shouldApplyAssignedApproverFilter =
        assignedStatus &&
        (!query.status ||
          query.status === assignedStatus ||
          (assignedStatus === EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS && query.status === "pending"))

      if (shouldApplyAssignedApproverFilter) {
        filter.$or = [
          { currentApproverUser: user._id },
          { currentApproverUser: null },
          { currentApproverUser: { $exists: false } },
        ]
      }
    }

    const expenses = await eventExpenseQueries.listExpenses(filter, {
      skip: (page - 1) * limit,
      limit,
    })

    const total = await eventExpenseQueries.countExpenses(filter)

    return success({
      expenses,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  }

  /**
   * Get approval history for an expense
   */
  async getApprovalHistory(expenseId) {
    const logs = await approvalLogQueries.findLogsByEntity("EventExpense", expenseId)

    return success({ history: logs })
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

  async _normalizeLegacyPendingStatus(expense) {
    if (!expense || expense.approvalStatus !== "pending") return

    expense.approvalStatus = EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS
    if (!expense.currentApprovalStage) {
      expense.currentApprovalStage = APPROVAL_STAGES.STUDENT_AFFAIRS
    }
    await eventExpenseOwner.persistExpense(expense)
  }
}

export const expenseService = new ExpenseService()
export default expenseService
