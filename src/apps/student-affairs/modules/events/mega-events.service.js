/**
 * @fileoverview Mega Events Service
 * @description Business logic for recurring mega event series and occurrence-specific proposal/expense flow.
 */

import { BaseService } from "../../../../services/base/BaseService.js"
import {
  success,
  created,
  notFound,
  badRequest,
  forbidden,
} from "../../../../services/base/ServiceResponse.js"
import MegaEventSeries from "../../../../models/event/MegaEventSeries.model.js"
import MegaEventOccurrence from "../../../../models/event/MegaEventOccurrence.model.js"
import {
  EVENT_STATUS,
  EVENT_CATEGORY,
  PROPOSAL_STATUS,
  EXPENSE_APPROVAL_STATUS,
  APPROVAL_STAGES,
  STATUS_TO_APPROVER,
  APPROVER_TO_STATUS,
  STAGE_TO_STATUS,
  APPROVAL_ACTIONS,
  POST_STUDENT_AFFAIRS_APPROVERS,
} from "./events.constants.js"
import { ROLES, SUBROLES } from "../../../../core/constants/roles.constants.js"

const parseDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const sortOccurrencesByDateDesc = (occurrences = []) =>
  [...occurrences].sort((left, right) => {
    const leftStart = parseDate(left?.scheduledStartDate)?.getTime() || 0
    const rightStart = parseDate(right?.scheduledStartDate)?.getTime() || 0
    if (rightStart !== leftStart) return rightStart - leftStart

    const leftEnd = parseDate(left?.scheduledEndDate)?.getTime() || 0
    const rightEnd = parseDate(right?.scheduledEndDate)?.getTime() || 0
    if (rightEnd !== leftEnd) return rightEnd - leftEnd

    const leftCreatedAt = parseDate(left?.createdAt)?.getTime() || 0
    const rightCreatedAt = parseDate(right?.createdAt)?.getTime() || 0
    return rightCreatedAt - leftCreatedAt
  })

class MegaEventsService extends BaseService {
  constructor() {
    super(MegaEventSeries, "MegaEventSeries")
  }

  _canManageSeries(user) {
    return user?.role === ROLES.ADMIN || user?.role === ROLES.SUPER_ADMIN
  }

  _buildHistoryEntry(stage, action, performedBy, comments = "") {
    return {
      stage,
      action,
      performedBy,
      comments: String(comments || "").trim(),
      createdAt: new Date(),
    }
  }

  _normalizeBills(rawBills = []) {
    if (!Array.isArray(rawBills)) return []

    return rawBills.map((bill = {}) => {
      const attachments = Array.isArray(bill.attachments)
        ? bill.attachments
            .map((attachment) => ({
              filename: String(attachment?.filename || "").trim(),
              url: String(attachment?.url || "").trim(),
            }))
            .filter((attachment) => attachment.filename && attachment.url)
        : []

      return {
        description: String(bill.description || "").trim(),
        amount: Number(bill.amount || 0),
        billNumber: String(bill.billNumber || "").trim(),
        billDate: bill.billDate ? new Date(bill.billDate) : null,
        vendor: String(bill.vendor || "").trim(),
        attachments,
      }
    })
  }

  _recalculateExpenseFields(expense) {
    if (!expense) return

    const totalExpenditure = Array.isArray(expense.bills)
      ? expense.bills.reduce((sum, bill) => sum + Number(bill?.amount || 0), 0)
      : 0

    expense.totalExpenditure = totalExpenditure
    expense.budgetVariance = totalExpenditure - Number(expense.estimatedBudget || 0)
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

  _prepareProposalPayload(data, existingProposal = null) {
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

    const eventBudgetAtSubmission = Number(existingProposal?.eventBudgetAtSubmission || 0)
    const totalExpenditure = Number(totalExpenditureRaw || 0)

    return {
      proposalText: String(proposalText || "").trim(),
      proposalDocumentUrl: String(proposalDocumentUrl || "").trim(),
      externalGuestsDetails: String(externalGuestsDetails || "").trim(),
      chiefGuestDocumentUrl: String(chiefGuestDocumentUrl || "").trim(),
      proposalDetails: proposalDetails || null,
      accommodationRequired,
      hasRegistrationFee,
      registrationFeeAmount: hasRegistrationFee
        ? Math.max(0, Number(registrationFeeAmountRaw || 0))
        : 0,
      totalExpectedIncome: Math.max(0, Number(totalExpectedIncomeRaw || 0)),
      totalExpenditure: Math.max(0, totalExpenditure),
      eventBudgetAtSubmission,
      budgetDeflection: Math.max(0, totalExpenditure) - eventBudgetAtSubmission,
    }
  }

  _prepareExpensePayload(data, existingExpense = null) {
    const hasValue = (key) => Object.prototype.hasOwnProperty.call(data || {}, key)

    const bills = hasValue("bills") ? data.bills : existingExpense?.bills
    const eventReportDocumentUrl = hasValue("eventReportDocumentUrl")
      ? data.eventReportDocumentUrl
      : existingExpense?.eventReportDocumentUrl
    const notes = hasValue("notes") ? data.notes : existingExpense?.notes

    return {
      bills: this._normalizeBills(bills),
      eventReportDocumentUrl: String(eventReportDocumentUrl || "").trim(),
      notes: String(notes || "").trim(),
    }
  }

  async _getOccurrenceById(occurrenceId) {
    return MegaEventOccurrence.findById(occurrenceId)
  }

  async getSeries() {
    const series = await this.model.find({ isActive: true }).sort({ name: 1 })

    const summary = await Promise.all(
      series.map(async (entry) => {
        const latestOccurrence = await MegaEventOccurrence.findOne({
          seriesId: entry._id,
        })
          .sort({ scheduledStartDate: -1, scheduledEndDate: -1, createdAt: -1 })
          .select(
            "title status scheduledStartDate scheduledEndDate proposalSubmitted proposalDueDate"
          )

        const occurrencesCount = await MegaEventOccurrence.countDocuments({
          seriesId: entry._id,
        })

        return {
          ...entry.toObject(),
          latestOccurrence,
          occurrencesCount,
        }
      })
    )

    return success({ series: summary })
  }

  async createSeries(data, user) {
    if (!this._canManageSeries(user)) {
      return forbidden("Only admin users can create mega event series")
    }

    const normalizedName = String(data.name || "").trim()
    if (!normalizedName) {
      return badRequest("Series name is required")
    }

    const existing = await this.model.findOne({ name: normalizedName })
    if (existing) {
      return badRequest("Mega event series already exists with this name")
    }

    const series = await this.model.create({
      name: normalizedName,
      description: String(data.description || "").trim(),
      createdBy: user._id,
      isActive: true,
    })

    return created({ series }, "Mega event series created")
  }

  async getSeriesById(seriesId) {
    const series = await this.model.findById(seriesId)
    if (!series || !series.isActive) {
      return notFound("Mega event series")
    }

    const occurrences = await MegaEventOccurrence.find({
      seriesId: series._id,
    }).sort({ scheduledStartDate: -1, scheduledEndDate: -1, createdAt: -1 })

    const ordered = sortOccurrencesByDateDesc(occurrences.map((entry) => entry.toObject()))
    const latestOccurrence = ordered.length > 0 ? ordered[0] : null
    const history = ordered.length > 1 ? ordered.slice(1) : []

    return success({
      series,
      latestOccurrence,
      history,
      occurrences: ordered,
    })
  }

  async createOccurrence(seriesId, data, user) {
    if (!this._canManageSeries(user)) {
      return forbidden("Only admin users can create mega event occurrences")
    }

    const series = await this.model.findById(seriesId)
    if (!series || !series.isActive) {
      return notFound("Mega event series")
    }

    const startDate = parseDate(data.startDate ?? data.scheduledStartDate)
    const endDate = parseDate(data.endDate ?? data.scheduledEndDate)

    if (!startDate || !endDate) {
      return badRequest("Valid start and end date are required")
    }
    if (endDate < startDate) {
      return badRequest("End date cannot be before start date")
    }

    const occurrence = await MegaEventOccurrence.create({
      seriesId: series._id,
      title: series.name,
      description:
        String(series.description || "").trim() ||
        `${series.name} mega event occurrence`,
      category: EVENT_CATEGORY.CULTURAL,
      scheduledStartDate: startDate,
      scheduledEndDate: endDate,
      status: EVENT_STATUS.PROPOSAL_PENDING,
      proposalSubmitted: false,
      createdBy: user._id,
      proposal: null,
      expense: null,
    })

    return created({ occurrence }, "Mega event occurrence created")
  }

  async getProposalByOccurrence(occurrenceId) {
    const occurrence = await MegaEventOccurrence.findById(occurrenceId)
      .populate("proposal.submittedBy", "name email subRole")
      .populate("proposal.rejectedBy", "name email subRole")

    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.proposal) {
      return notFound("Proposal")
    }

    return success({ proposal: occurrence.proposal })
  }

  async createProposalForOccurrence(occurrenceId, data, user) {
    if (user.subRole !== SUBROLES.PRESIDENT_GYMKHANA) {
      return forbidden("Only President Gymkhana can submit proposals for mega events")
    }

    const occurrence = await this._getOccurrenceById(occurrenceId)
    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (occurrence.proposal) {
      return badRequest("Proposal already submitted for this occurrence")
    }

    const payload = this._prepareProposalPayload(data)

    occurrence.proposal = {
      ...payload,
      submittedBy: user._id,
      status: PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS,
      currentApprovalStage: APPROVAL_STAGES.STUDENT_AFFAIRS,
      customApprovalChain: [],
      currentChainIndex: null,
      rejectionReason: "",
      rejectedBy: null,
      rejectedAt: null,
      approvedAt: null,
      revisionCount: 0,
      history: [
        this._buildHistoryEntry(
          APPROVAL_STAGES.PRESIDENT_GYMKHANA,
          APPROVAL_ACTIONS.SUBMITTED,
          user._id
        ),
      ],
    }
    occurrence.proposalSubmitted = true
    occurrence.status = EVENT_STATUS.PROPOSAL_SUBMITTED

    await occurrence.save()

    return created({ proposal: occurrence.proposal }, "Proposal submitted successfully")
  }

  async updateProposalForOccurrence(occurrenceId, data, user) {
    if (user.subRole !== SUBROLES.PRESIDENT_GYMKHANA) {
      return forbidden("Only President Gymkhana can update mega event proposals")
    }

    const occurrence = await this._getOccurrenceById(occurrenceId)
    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.proposal) {
      return notFound("Proposal")
    }

    const editableStatuses = [
      PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS,
      PROPOSAL_STATUS.REVISION_REQUESTED,
      PROPOSAL_STATUS.REJECTED,
    ]
    if (!editableStatuses.includes(occurrence.proposal.status)) {
      return badRequest("President can only update mega event proposals before/after review feedback")
    }

    const previousStatus = occurrence.proposal.status
    const payload = this._prepareProposalPayload(data, occurrence.proposal)

    Object.assign(occurrence.proposal, payload)
    occurrence.proposal.status = PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS
    occurrence.proposal.currentApprovalStage = APPROVAL_STAGES.STUDENT_AFFAIRS
    occurrence.proposal.customApprovalChain = []
    occurrence.proposal.currentChainIndex = null
    if (
      previousStatus === PROPOSAL_STATUS.REVISION_REQUESTED ||
      previousStatus === PROPOSAL_STATUS.REJECTED
    ) {
      occurrence.proposal.revisionCount += 1
    }
    occurrence.proposal.rejectionReason = ""
    occurrence.proposal.rejectedBy = null
    occurrence.proposal.rejectedAt = null
    occurrence.proposal.approvedAt = null
    occurrence.proposal.history.push(
      this._buildHistoryEntry(
        APPROVAL_STAGES.PRESIDENT_GYMKHANA,
        APPROVAL_ACTIONS.SUBMITTED,
        user._id,
        `Revision #${occurrence.proposal.revisionCount}`
      )
    )

    occurrence.proposalSubmitted = true
    occurrence.status = EVENT_STATUS.PROPOSAL_SUBMITTED
    occurrence.markModified("proposal")

    await occurrence.save()

    return success({ proposal: occurrence.proposal }, 200, "Proposal updated successfully")
  }

  async approveProposalForOccurrence(occurrenceId, comments, user, nextApprovalStages = []) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can approve proposals")
    }

    const occurrence = await this._getOccurrenceById(occurrenceId)
    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.proposal) {
      return notFound("Proposal")
    }

    const proposal = occurrence.proposal

    if (proposal.status === PROPOSAL_STATUS.APPROVED) {
      return badRequest("Proposal is already approved")
    }

    if (proposal.status === PROPOSAL_STATUS.REJECTED) {
      return badRequest("Rejected proposal must be updated and resubmitted")
    }

    const requiredSubRole = STATUS_TO_APPROVER[proposal.status]
    if (!requiredSubRole) {
      return badRequest("Proposal is not pending approval")
    }

    const isSuperAdmin = user.role === ROLES.SUPER_ADMIN
    if (!isSuperAdmin && user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can approve at this stage`)
    }

    const effectiveStage = isSuperAdmin ? requiredSubRole : user.subRole
    const isStudentAffairsReview =
      effectiveStage === APPROVAL_STAGES.STUDENT_AFFAIRS &&
      proposal.status === PROPOSAL_STATUS.PENDING_STUDENT_AFFAIRS

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
      proposal.approvedAt = null
    } else {
      const chain = Array.isArray(proposal.customApprovalChain)
        ? proposal.customApprovalChain
        : []
      const hasCustomChain = chain.length > 0

      if (hasCustomChain) {
        const currentIndex = chain.findIndex((stage) => stage === effectiveStage)
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
        const nextStatus = STAGE_TO_STATUS[effectiveStage]
        if (!nextStatus || nextStatus === PROPOSAL_STATUS.APPROVED) {
          proposal.status = PROPOSAL_STATUS.APPROVED
          proposal.currentApprovalStage = null
          proposal.currentChainIndex = null
        } else {
          proposal.status = nextStatus
          proposal.currentApprovalStage = STATUS_TO_APPROVER[nextStatus] || null
        }
      }
    }

    if (proposal.status === PROPOSAL_STATUS.APPROVED) {
      proposal.approvedAt = new Date()
      proposal.currentApprovalStage = null
      proposal.currentChainIndex = null
      occurrence.status = EVENT_STATUS.PROPOSAL_APPROVED
    }

    proposal.history.push(
      this._buildHistoryEntry(
        effectiveStage,
        APPROVAL_ACTIONS.APPROVED,
        user._id,
        comments
      )
    )

    occurrence.markModified("proposal")
    await occurrence.save()

    return success(
      { proposal: occurrence.proposal },
      200,
      proposal.status === PROPOSAL_STATUS.APPROVED
        ? "Proposal approved"
        : "Proposal moved to next approval stage"
    )
  }

  async rejectProposalForOccurrence(occurrenceId, reason, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can reject proposals")
    }

    const occurrence = await this._getOccurrenceById(occurrenceId)
    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.proposal) {
      return notFound("Proposal")
    }

    const proposal = occurrence.proposal
    const requiredSubRole = STATUS_TO_APPROVER[proposal.status]
    if (!requiredSubRole) {
      return badRequest("Proposal is not pending approval")
    }

    const isSuperAdmin = user.role === ROLES.SUPER_ADMIN
    if (!isSuperAdmin && user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can reject at this stage`)
    }

    const effectiveStage = isSuperAdmin ? requiredSubRole : user.subRole

    proposal.status = PROPOSAL_STATUS.REJECTED
    proposal.rejectionReason = String(reason || "").trim()
    proposal.rejectedBy = user._id
    proposal.rejectedAt = new Date()
    proposal.currentApprovalStage = null
    proposal.customApprovalChain = []
    proposal.currentChainIndex = null
    proposal.approvedAt = null
    proposal.history.push(
      this._buildHistoryEntry(
        effectiveStage,
        APPROVAL_ACTIONS.REJECTED,
        user._id,
        reason
      )
    )

    occurrence.status = EVENT_STATUS.PROPOSAL_PENDING
    occurrence.markModified("proposal")
    await occurrence.save()

    return success({ proposal: occurrence.proposal }, 200, "Proposal rejected")
  }

  async requestProposalRevisionForOccurrence(occurrenceId, comments, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can request proposal revisions")
    }

    const occurrence = await this._getOccurrenceById(occurrenceId)
    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.proposal) {
      return notFound("Proposal")
    }

    const proposal = occurrence.proposal
    const requiredSubRole = STATUS_TO_APPROVER[proposal.status]
    if (!requiredSubRole) {
      return badRequest("Proposal is not pending approval")
    }

    const isSuperAdmin = user.role === ROLES.SUPER_ADMIN
    if (!isSuperAdmin && user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can request revision at this stage`)
    }

    const effectiveStage = isSuperAdmin ? requiredSubRole : user.subRole

    proposal.status = PROPOSAL_STATUS.REVISION_REQUESTED
    proposal.rejectionReason = String(comments || "").trim()
    proposal.rejectedBy = user._id
    proposal.rejectedAt = new Date()
    proposal.currentApprovalStage = APPROVAL_STAGES.PRESIDENT_GYMKHANA
    proposal.customApprovalChain = []
    proposal.currentChainIndex = null
    proposal.approvedAt = null
    proposal.history.push(
      this._buildHistoryEntry(
        effectiveStage,
        APPROVAL_ACTIONS.REVISION_REQUESTED,
        user._id,
        comments
      )
    )

    occurrence.status = EVENT_STATUS.PROPOSAL_PENDING
    occurrence.markModified("proposal")
    await occurrence.save()

    return success({ proposal: occurrence.proposal }, 200, "Revision requested")
  }

  async getProposalHistoryForOccurrence(occurrenceId) {
    const occurrence = await MegaEventOccurrence.findById(occurrenceId)
      .populate("proposal.history.performedBy", "name email subRole")

    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.proposal) {
      return notFound("Proposal")
    }

    const history = [...(occurrence.proposal.history || [])].sort(
      (left, right) => new Date(left.createdAt) - new Date(right.createdAt)
    )

    return success({ history })
  }

  async getExpenseByOccurrence(occurrenceId) {
    const occurrence = await MegaEventOccurrence.findById(occurrenceId)
      .populate("expense.submittedBy", "name email subRole")
      .populate("expense.approvedBy", "name email subRole")
      .populate("expense.rejectedBy", "name email subRole")

    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.expense) {
      return notFound("Expense")
    }

    return success({ expense: occurrence.expense })
  }

  async submitExpenseForOccurrence(occurrenceId, data, user) {
    if (user.subRole !== SUBROLES.GS_GYMKHANA) {
      return forbidden("Only GS Gymkhana can submit expenses")
    }

    const occurrence = await this._getOccurrenceById(occurrenceId)
    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (occurrence.status !== EVENT_STATUS.PROPOSAL_APPROVED) {
      return badRequest("Expenses can only be submitted for approved proposals")
    }

    if (occurrence.expense) {
      return badRequest("Expenses already submitted for this occurrence")
    }

    const payload = this._prepareExpensePayload(data)

    occurrence.expense = {
      ...payload,
      submittedBy: user._id,
      estimatedBudget: Number(occurrence.proposal?.totalExpenditure || 0),
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
      history: [
        this._buildHistoryEntry(
          APPROVAL_STAGES.GS_GYMKHANA,
          APPROVAL_ACTIONS.SUBMITTED,
          user._id
        ),
      ],
    }

    this._recalculateExpenseFields(occurrence.expense)
    occurrence.markModified("expense")
    await occurrence.save()

    return created({ expense: occurrence.expense }, "Expenses submitted successfully")
  }

  async updateExpenseForOccurrence(occurrenceId, data, user) {
    if (user.subRole !== SUBROLES.GS_GYMKHANA) {
      return forbidden("Only GS Gymkhana can update expenses")
    }

    const occurrence = await this._getOccurrenceById(occurrenceId)
    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.expense) {
      return notFound("Expense")
    }

    if (occurrence.expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED) {
      return badRequest("Approved bills cannot be edited")
    }

    const payload = this._prepareExpensePayload(data, occurrence.expense)
    Object.assign(occurrence.expense, payload)
    occurrence.expense.approvalStatus = EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS
    occurrence.expense.currentApprovalStage = APPROVAL_STAGES.STUDENT_AFFAIRS
    occurrence.expense.customApprovalChain = []
    occurrence.expense.currentChainIndex = null
    occurrence.expense.rejectionReason = ""
    occurrence.expense.rejectedBy = null
    occurrence.expense.rejectedAt = null
    occurrence.expense.approvedBy = null
    occurrence.expense.approvedAt = null
    occurrence.expense.approvalComments = ""
    occurrence.expense.history.push(
      this._buildHistoryEntry(
        APPROVAL_STAGES.GS_GYMKHANA,
        APPROVAL_ACTIONS.SUBMITTED,
        user._id,
        "Expense resubmitted"
      )
    )

    this._recalculateExpenseFields(occurrence.expense)
    occurrence.markModified("expense")
    await occurrence.save()

    return success({ expense: occurrence.expense }, 200, "Expenses updated successfully")
  }

  async approveExpenseForOccurrence(occurrenceId, comments, user, nextApprovalStages = []) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can approve expenses")
    }

    const occurrence = await this._getOccurrenceById(occurrenceId)
    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.expense) {
      return notFound("Expense")
    }

    const expense = occurrence.expense

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
      expense.approvalStatus === EXPENSE_APPROVAL_STATUS.PENDING_STUDENT_AFFAIRS

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
      occurrence.status = EVENT_STATUS.COMPLETED
    }

    expense.approvalComments = String(comments || "").trim()
    expense.history.push(
      this._buildHistoryEntry(
        effectiveStage,
        APPROVAL_ACTIONS.APPROVED,
        user._id,
        comments
      )
    )

    occurrence.markModified("expense")
    await occurrence.save()

    return success(
      { expense: occurrence.expense },
      200,
      expense.approvalStatus === EXPENSE_APPROVAL_STATUS.APPROVED
        ? "Expense approved successfully"
        : "Expense moved to next approval stage"
    )
  }

  async rejectExpenseForOccurrence(occurrenceId, reason, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can reject expenses")
    }

    const occurrence = await this._getOccurrenceById(occurrenceId)
    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.expense) {
      return notFound("Expense")
    }

    const expense = occurrence.expense

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
    expense.rejectionReason = String(reason || "").trim()
    expense.rejectedBy = user._id
    expense.rejectedAt = new Date()
    expense.approvalComments = String(reason || "").trim()
    expense.approvedBy = null
    expense.approvedAt = null
    expense.history.push(
      this._buildHistoryEntry(
        effectiveStage,
        APPROVAL_ACTIONS.REJECTED,
        user._id,
        reason
      )
    )

    occurrence.markModified("expense")
    await occurrence.save()

    return success({ expense: occurrence.expense }, 200, "Expense rejected")
  }

  async getExpenseHistoryForOccurrence(occurrenceId) {
    const occurrence = await MegaEventOccurrence.findById(occurrenceId)
      .populate("expense.history.performedBy", "name email subRole")

    if (!occurrence) {
      return notFound("Mega event occurrence")
    }

    if (!occurrence.expense) {
      return notFound("Expense")
    }

    const history = [...(occurrence.expense.history || [])].sort(
      (left, right) => new Date(left.createdAt) - new Date(right.createdAt)
    )

    return success({ history })
  }
}

export const megaEventsService = new MegaEventsService()
export default megaEventsService
