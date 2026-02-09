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
import { EVENT_STATUS } from "./events.constants.js"
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
      approvalStatus: "pending",
      approvedBy: null,
      approvedAt: null,
      approvalComments: "",
    })

    // Link event with expense for quick access
    event.expenseId = expense._id
    await event.save()

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

    if (expense.approvalStatus === "approved") {
      return badRequest("Approved bills cannot be edited")
    }

    Object.assign(expense, data)
    expense.approvalStatus = "pending"
    expense.approvedBy = null
    expense.approvedAt = null
    expense.approvalComments = ""
    await expense.save()

    return success({ expense }, 200, "Expenses updated successfully")
  }

  /**
   * Approve expense submission (Admin only)
   */
  async approveExpense(expenseId, comments, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can approve expenses")
    }

    const expense = await this.model.findById(expenseId)
    if (!expense) {
      return notFound("Expense")
    }

    if (expense.approvalStatus === "approved") {
      return badRequest("Expense is already approved")
    }

    expense.approvalStatus = "approved"
    expense.approvedBy = user._id
    expense.approvedAt = new Date()
    expense.approvalComments = comments?.trim() || ""
    await expense.save()

    await GymkhanaEvent.findByIdAndUpdate(expense.eventId, {
      status: EVENT_STATUS.COMPLETED,
      expenseId: expense._id,
    })

    return success({ expense }, 200, "Expense approved successfully")
  }

  /**
   * Get expense by ID
   */
  async getExpenseById(expenseId) {
    const expense = await this.model.findById(expenseId)
      .populate("eventId")
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email subRole")

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

    if (!expense) {
      return notFound("Expense")
    }

    return success({ expense })
  }

  /**
   * Get all expenses (for admin view)
   */
  async getAllExpenses(query, user) {
    // Only admins can view all expenses
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN && user.role !== ROLES.GYMKHANA) {
      return forbidden("Not authorized to view expenses")
    }

    const page = Math.max(1, parseInt(query.page, 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10))

    const expenses = await this.model.find()
      .populate("eventId", "title category scheduledStartDate scheduledEndDate")
      .populate("submittedBy", "name email")
      .populate("approvedBy", "name email subRole")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)

    const total = await this.model.countDocuments()

    return success({
      expenses,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  }
}

export const expenseService = new ExpenseService()
export default expenseService
