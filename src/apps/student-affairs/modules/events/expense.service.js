/**
 * @fileoverview Expense Service
 * @description Business logic for post-event expense submission
 */

import { BaseService } from "../../../../services/base/BaseService.js"
import {
  success,
  created,
  notFound,
  badRequest,
  forbidden,
} from "../../../../services/base/ServiceResponse.js"
import EventExpense from "../../../../models/event/EventExpense.model.js"
import GymkhanaEvent from "../../../../models/event/GymkhanaEvent.model.js"
import EventProposal from "../../../../models/event/EventProposal.model.js"
import ApprovalLog from "../../../../models/event/ApprovalLog.model.js"
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

class ExpenseService extends BaseService {
  constructor() {
    super(EventExpense, "EventExpense")
  }

  /**
   * Submit expenses for an event (GS only)
   */
  async submitExpense(eventId, data, user) {
    if (user.subRole !== SUBROLES.GS_GYMKHANA) {
      return forbidden("Only GS Gymkhana can submit expenses")
    }

    const event = await GymkhanaEvent.findById(eventId)
    if (!event) {
      return notFound("Event")
    }

    if (event.status !== EVENT_STATUS.PROPOSAL_APPROVED) {
      return badRequest("Expenses can only be submitted for approved events")
    }

    // Check if expense already exists
    const existing = await this.model.findOne({ eventId })
    if (existing) {
      return badRequest("Expenses already submitted for this event")
    }

    // Use proposal expenditure as planned budget snapshot for expense tracking
    const proposal = await EventProposal.findById(event.proposalId)
    const estimatedBudget = proposal?.totalExpenditure || event.estimatedBudget

    const expense = await this.model.create({
      eventId,
      submittedBy: user._id,
      ...data,
      estimatedBudget,
      approvalStatus: EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS,
      currentApprovalStage: APPROVAL_STAGES.STUDENT_AFFAIRS,
      customApprovalChain: [],
      currentChainIndex: null,
      rejectionReason: "",
      rejectedBy: null,
      rejectedAt: null,
      approvedBy: null,
      approvedAt: null,
      approvalComments: "",
    })

    // Link event with expense for quick access
    event.expenseId = expense._id
    await event.save()

    await ApprovalLog.create({
      entityType: "EventExpense",
      entityId: expense._id,
      stage: APPROVAL_STAGES.GS_GYMKHANA,
      action: APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
    })

    return created({ expense }, "Expenses submitted successfully")
  }

  /**
   * Update expenses (GS only)
   */
  async updateExpense(expenseId, data, user) {
    if (user.subRole !== SUBROLES.GS_GYMKHANA) {
      return forbidden("Only GS Gymkhana can update expenses")
    }

    const expense = await this.model.findById(expenseId)
    if (!expense) {
      return notFound("Expense")
    }
    await this._normalizeLegacyPendingStatus(expense)

    if (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
      return badRequest("Approved bills cannot be edited")
    }

    Object.assign(expense, data)
    expense.approvalStatus = EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS
    expense.currentApprovalStage = APPROVAL_STAGES.STUDENT_AFFAIRS
    expense.customApprovalChain = []
    expense.currentChainIndex = null
    expense.rejectionReason = ""
    expense.rejectedBy = null
    expense.rejectedAt = null
    expense.approvedBy = null
    expense.approvedAt = null
    expense.approvalComments = ""
    await expense.save()

    return success({ expense }, 200, "Expenses updated successfully")
  }

  /**
   * Approve expense submission (Admin approval chain)
   */
  async approveExpense(expenseId, comments, user, nextApprovalStages = []) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can approve expenses")
    }

    const expense = await this.model.findById(expenseId)
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

    const isSuperAdmin = user.role === ROLES.SUPER_ADMIN
    if (!isSuperAdmin && user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can approve at this stage`)
    }

    const effectiveStage = isSuperAdmin ? requiredSubRole : user.subRole
    const isStudentAffairsReview =
      effectiveStage === APPROVAL_STAGES.STUDENT_AFFAIRS &&
      (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS ||
        expense.approvalStatus === "pending")

    if (isStudentAffairsReview) {
      const chainValidation = this._validatePostStudentAffairsChain(nextApprovalStages)
      if (!chainValidation.success) {
        return badRequest(chainValidation.message)
      }
      const chain = chainValidation.chain
      const firstStage = chain[0]
      const nextStatus = APPROVER_TO_STATUS[firstStage]

      expense.customApprovalChain = chain
      expense.currentChainIndex = 0
      expense.approvalStatus = nextStatus
      expense.currentApprovalStage = firstStage
      expense.approvedBy = null
      expense.approvedAt = null
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
        } else {
          const nextStatus = APPROVER_TO_STATUS[nextStage]
          expense.approvalStatus = nextStatus
          expense.currentApprovalStage = nextStage
          expense.currentChainIndex = currentIndex + 1
        }
      } else {
        // Legacy/default fallback
        const nextStatus = STAGE_TO_STATUS[effectiveStage]
        if (!nextStatus || nextStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
          expense.approvalStatus = EXPENSE_APPROVAL_STATUS.APPROVED
          expense.currentApprovalStage = null
          expense.currentChainIndex = null
        } else {
          expense.approvalStatus = nextStatus
          expense.currentApprovalStage = STATUS_TO_APPROVER[nextStatus] || null
        }
      }
    }

    if (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
      expense.approvedBy = user._id
      expense.approvedAt = new Date()
    }

    expense.approvalComments = comments?.trim() || ""
    await expense.save()

    await ApprovalLog.create({
      entityType: "EventExpense",
      entityId: expense._id,
      stage: effectiveStage,
      action: APPROVAL_ACTIONS.APPROVED,
      performedBy: user._id,
      comments: comments?.trim() || "",
    })

    if (expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
      await GymkhanaEvent.findByIdAndUpdate(expense.eventId, {
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

    const expense = await this.model.findById(expenseId)
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
    if (!isSuperAdmin && user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can reject at this stage`)
    }

    const effectiveStage = isSuperAdmin ? requiredSubRole : user.subRole

    expense.approvalStatus = EXPENSE_APPROVAL_STATUS.REJECTED
    expense.currentApprovalStage = null
    expense.customApprovalChain = []
    expense.currentChainIndex = null
    expense.rejectionReason = reason
    expense.rejectedBy = user._id
    expense.rejectedAt = new Date()
    expense.approvalComments = reason?.trim() || ""
    expense.approvedBy = null
    expense.approvedAt = null
    await expense.save()

    await ApprovalLog.create({
      entityType: "EventExpense",
      entityId: expense._id,
      stage: effectiveStage,
      action: APPROVAL_ACTIONS.REJECTED,
      performedBy: user._id,
      comments: reason?.trim() || "",
    })

    return success({ expense }, 200, "Expense rejected")
  }

  /**
   * Get expense by ID
   */
  async getExpenseById(expenseId) {
    const expense = await this.model.findById(expenseId)
      .populate("eventId")
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email subRole")
      .populate("rejectedBy", "name email subRole")

    if (!expense) {
      return notFound("Expense")
    }

    return success({ expense })
  }

  /**
   * Get expense for an event
   */
  async getExpenseByEvent(eventId) {
    const expense = await this.model.findOne({ eventId })
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email subRole")
      .populate("rejectedBy", "name email subRole")

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
        [SUBROLES.JOINT_REGISTRAR_SA]: EXPENSE_APPROVAL_STATUS.PENDING_JOINT_REGISTRAR,
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
    }

    const expenses = await this.model.find(filter)
      .populate("eventId", "title category scheduledStartDate scheduledEndDate")
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email subRole")
      .populate("rejectedBy", "name email subRole")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const total = await this.model.countDocuments(filter)

    return success({
      expenses,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  }

  /**
   * Get approval history for an expense
   */
  async getApprovalHistory(expenseId) {
    const logs = await ApprovalLog.find({
      entityType: "EventExpense",
      entityId: expenseId,
    })
      .sort({ createdAt: 1 })
      .populate("performedBy", "name email subRole")

    return success({ history: logs })
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

  async _normalizeLegacyPendingStatus(expense) {
    if (!expense || expense.approvalStatus !== "pending") return

    expense.approvalStatus = EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS
    if (!expense.currentApprovalStage) {
      expense.currentApprovalStage = APPROVAL_STAGES.STUDENT_AFFAIRS
    }
    await expense.save()
  }
}

export const expenseService = new ExpenseService()
export default expenseService
