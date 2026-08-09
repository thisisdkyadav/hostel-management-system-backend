/**
 * @fileoverview Calendar Service
 * @description Business logic for Activity Calendar management
 * Admin creates/locks calendars, Gymkhana users edit (if unlocked) or request amendments (if locked)
 */

import {
  success,
  created,
  notFound,
  badRequest,
  forbidden,
  paginated,
} from "../../../../services/base/ServiceResponse.js"
import { activityCalendarOwner } from "../../../../services/gymkhana/activityCalendarOwner.service.js"
import { activityCalendarQueries } from "../../../../services/gymkhana/activityCalendarQueries.service.js"
import { gymkhanaEventOwner } from "../../../../services/gymkhana/gymkhanaEventOwner.service.js"
import { gymkhanaEventQueries } from "../../../../services/gymkhana/gymkhanaEventQueries.service.js"
import { approvalLogOwner } from "../../../../services/gymkhana/approvalLogOwner.service.js"
import { approvalLogQueries } from "../../../../services/gymkhana/approvalLogQueries.service.js"
import { userQueries } from "../../../../services/user/userQueries.service.js"
import { auditService } from "../../../../services/audit/audit.service.js"
import { pickFields } from "../../../../utils/objectDiff.js"
import {
  CALENDAR_STATUS,
  APPROVAL_STAGES,
  STAGE_TO_STATUS,
  STATUS_TO_APPROVER,
  APPROVER_TO_STATUS,
  APPROVAL_ACTIONS,
  POST_STUDENT_AFFAIRS_APPROVERS,
} from "./events.constants.js"
import { SUBROLES, ROLES } from "../../../../core/constants/roles.constants.js"
import {
  normalizeCalendarOverallBudget,
  normalizeCategoryBudgetCaps,
  validateCalendarOverallBudgetCap,
  validateCategoryBudgetCaps,
} from "./budget-caps.utils.js"
import {
  getDefaultCategoryDefinitions,
  getGlobalGymkhanaCategoryDefinitions,
  validateEventCategories,
} from "./category-definitions.utils.js"
import {
  clearCustomApprovalAssignments,
  getCustomAssignmentState,
  normalizeObjectId,
  resolvePostStudentAffairsAssignments,
} from "./approval-assignments.utils.js"
import { notifyStageApprovers, notifySubmitterByEmail } from "./approval-email.utils.js"

class CalendarService {
  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new activity calendar (Admin only)
   */
  async createCalendar(data, user) {
    // Verify user is Admin
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only Admin can create activity calendars")
    }

    // Check if calendar for this year exists
    const existing = await activityCalendarQueries.findCalendarByAcademicYear(data.academicYear)
    if (existing) {
      return badRequest(`Activity calendar for ${data.academicYear} already exists`)
    }

    const normalizedCategoryDefinitions = await getGlobalGymkhanaCategoryDefinitions({
      events: data.events,
      budgetCaps: data.budgetCaps,
    })
    const categoryValidation = validateEventCategories(data.events || [], normalizedCategoryDefinitions)
    if (!categoryValidation.success) {
      return badRequest(categoryValidation.message)
    }

    const normalizedBudgetCaps = normalizeCategoryBudgetCaps(
      data.budgetCaps,
      normalizedCategoryDefinitions
    )
    const budgetCapValidation = validateCategoryBudgetCaps(
      data.events || [],
      normalizedBudgetCaps,
      normalizedCategoryDefinitions
    )
    if (!budgetCapValidation.success) {
      return badRequest(budgetCapValidation.message)
    }

    const overallBudgetValidation = validateCalendarOverallBudgetCap(
      data.overallBudget,
      normalizedBudgetCaps,
      normalizedCategoryDefinitions
    )
    if (!overallBudgetValidation.success) {
      return badRequest(overallBudgetValidation.message)
    }

    const calendar = await activityCalendarOwner.createCalendar({
      academicYear: data.academicYear,
      allowProposalBeforeApproval: Boolean(data.allowProposalBeforeApproval),
      overallBudget: overallBudgetValidation.overallBudget,
      categoryDefinitions: [],
      budgetCaps: normalizedBudgetCaps,
      createdBy: user._id,
      status: CALENDAR_STATUS.DRAFT,
      customApprovalChain: [],
      currentChainIndex: null,
      customApprovalAssignments: [],
      currentApproverUser: null,
      isLocked: false,
    })

    await this._writeCalendarEvents(calendar._id, data.events || [], user)

    return created({ calendar: await this._attachResolvedCategoryDefinitions(calendar) }, "Activity calendar created")
  }

  /**
   * Lock calendar (Admin only) - prevents GS from editing
   */
  async lockCalendar(calendarId, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only Admin can lock calendars")
    }

    const calendar = await activityCalendarQueries.findCalendarById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    if (calendar.isLocked) {
      return badRequest("Calendar is already locked")
    }

    calendar.isLocked = true
    calendar.lockedBy = user._id
    calendar.lockedAt = new Date()
    await activityCalendarOwner.persistCalendar(calendar)

    return success({ calendar }, 200, "Calendar locked successfully")
  }

  /**
   * Unlock calendar (Admin only) - allows GS to edit
   */
  async unlockCalendar(calendarId, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only Admin can unlock calendars")
    }

    const calendar = await activityCalendarQueries.findCalendarById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    if (!calendar.isLocked) {
      return badRequest("Calendar is already unlocked")
    }

    calendar.isLocked = false
    calendar.lockedBy = null
    calendar.lockedAt = null
    await activityCalendarOwner.persistCalendar(calendar)

    return success({ calendar }, 200, "Calendar unlocked successfully")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GYMKHANA OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Update calendar events
   * GS: can edit draft/rejected
   * President: can edit all pre-submission calendars
   */
  async updateCalendar(calendarId, data, user) {
    const calendar = await activityCalendarQueries.findCalendarById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    const isGS = user.subRole === SUBROLES.GS_GYMKHANA
    const isPresident = user.subRole === SUBROLES.PRESIDENT_GYMKHANA

    if (!isGS && !isPresident) {
      return forbidden("Only GS or President Gymkhana can update calendar events")
    }

    // Check if calendar is locked
    if (calendar.isLocked) {
      return forbidden("Calendar is locked. Please request edit permission through an amendment.")
    }

    const editableStatuses = [
      CALENDAR_STATUS.DRAFT,
      CALENDAR_STATUS.REJECTED,
      CALENDAR_STATUS.PENDING_PRESIDENT,
      CALENDAR_STATUS.PENDING_STUDENT_AFFAIRS,
      CALENDAR_STATUS.PENDING_OFFICER,
      CALENDAR_STATUS.PENDING_ASSOCIATE_DEAN,
      CALENDAR_STATUS.PENDING_DEAN,
      CALENDAR_STATUS.APPROVED,
    ]

    if (!editableStatuses.includes(calendar.status)) {
      return badRequest("This calendar cannot be edited in its current status")
    }

    if (data.events) {
      const categoryDefinitions = await getGlobalGymkhanaCategoryDefinitions({
        calendar,
      })
      const categoryValidation = validateEventCategories(data.events, categoryDefinitions)
      if (!categoryValidation.success) {
        return badRequest(categoryValidation.message)
      }

      const budgetCapValidation = validateCategoryBudgetCaps(
        data.events,
        calendar.budgetCaps,
        categoryDefinitions
      )
      if (!budgetCapValidation.success) {
        return badRequest(budgetCapValidation.message)
      }
    }

    if ((isGS || isPresident) && calendar.status !== CALENDAR_STATUS.DRAFT) {
      calendar.status = CALENDAR_STATUS.DRAFT
      calendar.currentApprovalStage = null
      calendar.customApprovalChain = []
      calendar.currentChainIndex = null
      clearCustomApprovalAssignments(calendar)
      calendar.approvedAt = null
      calendar.rejectionReason = null
      calendar.rejectedBy = null
      calendar.rejectedAt = null
    }

    await activityCalendarOwner.persistCalendar(calendar)

    if (data.events) {
      await this._writeCalendarEvents(calendar._id, data.events, user)
    }

    return success({ calendar: await this._attachResolvedCategoryDefinitions(calendar) }, 200, "Calendar updated successfully")
  }

  async updateCalendarSettings(calendarId, data, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only Admin can update calendar settings")
    }

    const calendar = await activityCalendarQueries.findCalendarById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    const previousAllowProposalBeforeApproval = Boolean(calendar.allowProposalBeforeApproval)
    const previousOverallBudget = normalizeCalendarOverallBudget(calendar.overallBudget)
    const nextAllowProposalBeforeApproval =
      typeof data.allowProposalBeforeApproval === "boolean"
        ? data.allowProposalBeforeApproval
        : previousAllowProposalBeforeApproval
    const nextOverallBudget =
      data.overallBudget === undefined
        ? previousOverallBudget
        : normalizeCalendarOverallBudget(data.overallBudget)
    const nextCategoryDefinitions = await getGlobalGymkhanaCategoryDefinitions({
      calendar,
      budgetCaps: data.budgetCaps === undefined ? calendar.budgetCaps : data.budgetCaps,
    })
    const previousBudgetCaps = normalizeCategoryBudgetCaps(
      calendar.budgetCaps,
      nextCategoryDefinitions
    )
    const nextBudgetCaps = normalizeCategoryBudgetCaps(
      data.budgetCaps === undefined ? calendar.budgetCaps : data.budgetCaps,
      nextCategoryDefinitions
    )
    const allowProposalSettingChanged =
      nextAllowProposalBeforeApproval !== previousAllowProposalBeforeApproval
    const budgetCapsChanged =
      JSON.stringify(previousBudgetCaps) !== JSON.stringify(nextBudgetCaps)
    const overallBudgetChanged = previousOverallBudget !== nextOverallBudget

    if (!allowProposalSettingChanged && !budgetCapsChanged && !overallBudgetChanged) {
      return success({ calendar }, 200, "Calendar settings updated successfully")
    }

    const calendarEvents = await this._loadCalendarEvents(calendar._id)
    const categoryValidation = validateEventCategories(calendarEvents, nextCategoryDefinitions)
    if (!categoryValidation.success) {
      return badRequest(categoryValidation.message)
    }

    const budgetCapValidation = validateCategoryBudgetCaps(
      calendarEvents,
      nextBudgetCaps,
      nextCategoryDefinitions
    )
    if (!budgetCapValidation.success) {
      return badRequest("Cannot update calendar settings. " + budgetCapValidation.message)
    }

    const overallBudgetValidation = validateCalendarOverallBudgetCap(
      nextOverallBudget,
      nextBudgetCaps,
      nextCategoryDefinitions
    )
    if (!overallBudgetValidation.success) {
      return badRequest("Cannot update calendar settings. " + overallBudgetValidation.message)
    }

    calendar.allowProposalBeforeApproval = nextAllowProposalBeforeApproval
    calendar.overallBudget = overallBudgetValidation.overallBudget
    calendar.budgetCaps = nextBudgetCaps
    await activityCalendarOwner.persistCalendar(calendar)

    return success({ calendar: await this._attachResolvedCategoryDefinitions(calendar) }, 200, "Calendar settings updated successfully")
  }

  /**
   * Submit calendar for approval (President only)
   */
  async submitCalendar(calendarId, user, options = {}) {
    const { allowOverlappingDates = false } = options

    const calendar = await activityCalendarQueries.findCalendarById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    if (user.subRole !== SUBROLES.PRESIDENT_GYMKHANA) {
      return forbidden("Only President Gymkhana can submit calendars")
    }

    if (calendar.isLocked) {
      return forbidden("Calendar is locked. Cannot submit.")
    }

    const submittableStatuses = [
      CALENDAR_STATUS.DRAFT,
      CALENDAR_STATUS.REJECTED,
      CALENDAR_STATUS.PENDING_PRESIDENT,
      CALENDAR_STATUS.PENDING_STUDENT_AFFAIRS,
      CALENDAR_STATUS.PENDING_OFFICER,
      CALENDAR_STATUS.PENDING_ASSOCIATE_DEAN,
      CALENDAR_STATUS.PENDING_DEAN,
      CALENDAR_STATUS.APPROVED,
    ]

    if (!submittableStatuses.includes(calendar.status)) {
      return badRequest("This calendar cannot be submitted in its current status")
    }

    const calendarEvents = await this._loadCalendarEvents(calendar._id)
    if (calendarEvents.length === 0) {
      return badRequest("Calendar must have at least one event")
    }

    const overlapAnalysis = this._analyzeOverlaps(calendarEvents)
    if (overlapAnalysis.overlaps.length > 0 && !allowOverlappingDates) {
      return success({
        requiresOverlapConfirmation: true,
        overlaps: overlapAnalysis.overlaps,
        overlapSummary: overlapAnalysis.summary,
        message: "Overlapping date ranges found. Confirm to submit anyway.",
      })
    }

    const previousStatus = calendar.status

    // President submits calendar directly to Student Affairs.
    calendar.status = CALENDAR_STATUS.PENDING_STUDENT_AFFAIRS
    calendar.currentApprovalStage = APPROVAL_STAGES.STUDENT_AFFAIRS
    calendar.customApprovalChain = []
    calendar.currentChainIndex = null
    clearCustomApprovalAssignments(calendar)
    calendar.approvedAt = null
    calendar.rejectionReason = null
    calendar.rejectedBy = null
    calendar.rejectedAt = null
    calendar.isLocked = true
    calendar.lockedBy = user._id
    calendar.lockedAt = new Date()
    await activityCalendarOwner.persistCalendar(calendar)

    // Log the submission
    await approvalLogOwner.createLog({
      entityType: "ActivityCalendar",
      entityId: calendar._id,
      stage: APPROVAL_STAGES.PRESIDENT_GYMKHANA,
      action: APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
      comments:
        previousStatus === CALENDAR_STATUS.DRAFT
          ? undefined
          : `Resubmitted after edits from ${String(previousStatus).replace(/_/g, " ")}`,
    })

    // Notify Student Affairs that a calendar awaits their review
    await notifyStageApprovers({
      entityType: "ActivityCalendar",
      entityId: calendar._id,
      entityLabel: calendar.academicYear,
      stage: APPROVAL_STAGES.STUDENT_AFFAIRS,
      linkParams: { academicYear: calendar.academicYear },
      movedBy: user.name,
      movedByStage: APPROVAL_STAGES.PRESIDENT_GYMKHANA,
    })

    return success({
      calendar,
      overlapSummary: overlapAnalysis.summary,
    }, 200, "Calendar submitted for approval")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APPROVAL OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Approve calendar (by appropriate stage approver)
   */
  async approveCalendar(
    calendarId,
    comments,
    user,
    nextApprovalStages = [],
    nextApprovers = [],
    directApprove = false
  ) {
    const calendar = await activityCalendarQueries.findCalendarById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    let notifyNextApprover = false
    let nextApproverUserId = null
    let nextApproverStage = null

    // Check if user can approve at current stage
    const requiredSubRole = STATUS_TO_APPROVER[calendar.status]
    if (!requiredSubRole) {
      return badRequest("Calendar is not pending approval")
    }

    const assignedApproverUserId = normalizeObjectId(calendar.currentApproverUser)
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
      calendar.status === CALENDAR_STATUS.PENDING_STUDENT_AFFAIRS
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
        calendar.status = CALENDAR_STATUS.APPROVED
        calendar.currentApprovalStage = null
        calendar.currentChainIndex = null
        calendar.currentApproverUser = null
        calendar.customApprovalChain = []
        clearCustomApprovalAssignments(calendar)
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

        calendar.customApprovalChain = chain
        calendar.customApprovalAssignments = assignmentResolution.assignments
        calendar.currentChainIndex = 0
        calendar.status = nextStatus
        calendar.currentApprovalStage = firstStage
        calendar.currentApproverUser = assignmentResolution.currentApproverUser
        notifyNextApprover = assignmentResolution.assignments.length > 0
        nextApproverUserId = assignmentResolution.currentApproverUser
        nextApproverStage = firstStage
        approvalAction = APPROVAL_ACTIONS.RECOMMENDED
      }
    } else {
      const assignmentState = getCustomAssignmentState(calendar, currentStage)
      const hasAssignedApprovers = assignmentState.hasAssignments

      if (hasAssignedApprovers) {
        if (assignmentState.currentIndex === -1 || !assignmentState.currentAssignment) {
          return badRequest("Assigned approval flow is misconfigured for this calendar")
        }

        const nextAssignment = assignmentState.nextAssignment
        if (!nextAssignment) {
          calendar.status = CALENDAR_STATUS.APPROVED
          calendar.currentApprovalStage = null
          calendar.currentChainIndex = null
          calendar.currentApproverUser = null
        } else {
          const nextStatus = APPROVER_TO_STATUS[nextAssignment.stage]
          calendar.status = nextStatus
          calendar.currentApprovalStage = nextAssignment.stage
          calendar.currentChainIndex = assignmentState.currentIndex + 1
          calendar.currentApproverUser = normalizeObjectId(nextAssignment.userId)
          notifyNextApprover = true
          nextApproverUserId = normalizeObjectId(nextAssignment.userId)
          nextApproverStage = nextAssignment.stage
        }
      } else {
        const chain = Array.isArray(calendar.customApprovalChain)
          ? calendar.customApprovalChain
          : []
        const hasCustomChain = chain.length > 0

        if (hasCustomChain) {
          const currentIndex = chain.findIndex((stage) => stage === currentStage)
          if (currentIndex === -1) {
            return badRequest("Approval chain is misconfigured for this calendar")
          }

          const nextStage = chain[currentIndex + 1]
          if (!nextStage) {
            calendar.status = CALENDAR_STATUS.APPROVED
            calendar.currentApprovalStage = null
            calendar.currentChainIndex = null
            calendar.currentApproverUser = null
          } else {
            const nextStatus = APPROVER_TO_STATUS[nextStage]
            calendar.status = nextStatus
            calendar.currentApprovalStage = nextStage
            calendar.currentChainIndex = currentIndex + 1
            calendar.currentApproverUser = null
          }
        } else {
          // Legacy/default flow fallback
          const nextStatus = STAGE_TO_STATUS[user.subRole]
          calendar.status = nextStatus
          calendar.currentApproverUser = null

          if (nextStatus === CALENDAR_STATUS.APPROVED) {
            calendar.currentApprovalStage = null
          } else {
            const nextApprover = STATUS_TO_APPROVER[nextStatus]
            calendar.currentApprovalStage = nextApprover
          }
        }
      }
    }

    if (calendar.status === CALENDAR_STATUS.APPROVED) {
      calendar.approvedAt = new Date()
      calendar.currentApprovalStage = null
      calendar.currentChainIndex = null
      calendar.currentApproverUser = null
      calendar.isLocked = true
      calendar.lockedBy = user._id
      calendar.lockedAt = new Date()
    } else {
      calendar.isLocked = true
      calendar.lockedBy = user._id
      calendar.lockedAt = new Date()
    }

    await activityCalendarOwner.persistCalendar(calendar)

    // Log the approval
    await approvalLogOwner.createLog({
      entityType: "ActivityCalendar",
      entityId: calendar._id,
      stage: currentStage,
      action: approvalAction,
      performedBy: user._id,
      comments: normalizedComments,
    })

    // Email whoever must act at the calendar's new stage (assigned user, else all sub-role holders)
    if (calendar.status !== CALENDAR_STATUS.APPROVED && calendar.status !== CALENDAR_STATUS.REJECTED) {
      await notifyStageApprovers({
        entityType: "ActivityCalendar",
        entityId: calendar._id,
        entityLabel: calendar.academicYear,
        stage: STATUS_TO_APPROVER[calendar.status],
        assignedUserId: calendar.currentApproverUser || null,
        linkParams: { academicYear: calendar.academicYear },
        movedBy: user.name,
        movedByStage: currentStage,
        comments: normalizedComments,
      })
    }

    return success(
      { calendar },
      200,
      approvalAction === APPROVAL_ACTIONS.RECOMMENDED
        ? "Calendar recommended successfully"
        : "Calendar approved successfully"
    )
  }

  /**
   * Reject calendar
   */
  async rejectCalendar(calendarId, reason, user) {
    const calendar = await activityCalendarQueries.findCalendarById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    // Check if user can reject at current stage
    const requiredSubRole = STATUS_TO_APPROVER[calendar.status]
    if (!requiredSubRole) {
      return badRequest("Calendar is not pending approval")
    }

    const assignedApproverUserId = normalizeObjectId(calendar.currentApproverUser)
    if (assignedApproverUserId && normalizeObjectId(user._id) !== assignedApproverUserId) {
      return forbidden("Only the assigned approver can reject at this stage")
    }

    if (user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can reject at this stage`)
    }

    const currentStage = user.subRole

    calendar.status = CALENDAR_STATUS.REJECTED
    calendar.rejectionReason = reason
    calendar.rejectedBy = user._id
    calendar.rejectedAt = new Date()
    calendar.currentApprovalStage = null
    calendar.customApprovalChain = []
    calendar.currentChainIndex = null
    clearCustomApprovalAssignments(calendar)
    await activityCalendarOwner.persistCalendar(calendar)

    // Log the rejection
    await approvalLogOwner.createLog({
      entityType: "ActivityCalendar",
      entityId: calendar._id,
      stage: currentStage,
      action: APPROVAL_ACTIONS.REJECTED,
      performedBy: user._id,
      comments: reason,
    })

    // Notify the Gymkhana President(s) who own the calendar so they can revise & resubmit
    const presidents = await userQueries.findUsers({ role: ROLES.GYMKHANA, subRole: APPROVAL_STAGES.PRESIDENT_GYMKHANA }, { select: "_id" })
    for (const president of presidents) {
      await notifySubmitterByEmail({
        entityType: "ActivityCalendar",
        entityId: calendar._id,
        entityLabel: calendar.academicYear,
        submitterUserId: president._id,
        action: "rejected",
        actorName: user.name,
        actorStage: currentStage,
        comments: reason,
        linkParams: { academicYear: calendar.academicYear },
      })
    }

    return success({ calendar }, 200, "Calendar rejected")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READ OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get calendar by ID
   */
  async getCalendarById(calendarId) {
    const calendar = await activityCalendarQueries.findCalendarByIdPopulated(calendarId)

    if (!calendar) {
      return notFound("Activity calendar")
    }

    return success({ calendar: await this._attachResolvedCategoryDefinitions(calendar) })
  }

  /**
   * Get calendar by academic year
   */
  async getCalendarByYear(year) {
    const calendar = await activityCalendarQueries.findCalendarByYearPopulated(year)

    if (!calendar) {
      return notFound("Activity calendar")
    }

    return success({ calendar: await this._attachResolvedCategoryDefinitions(calendar) })
  }

  /**
   * Get calendars with filters
   */
  async getCalendars(query) {
    const { page = 1, limit = 10, status, academicYear } = query

    const filter = {}
    if (status) filter.status = status
    if (academicYear) filter.academicYear = academicYear

    const pageNum = parseInt(page, 10)
    const limitNum = parseInt(limit, 10)
    const [items, total] = await Promise.all([
      activityCalendarQueries.listCalendars(filter, { skip: (pageNum - 1) * limitNum, limit: limitNum }),
      activityCalendarQueries.countCalendars(filter),
    ])
    return paginated(items, { page, limit, total })
  }

  /**
   * Get all academic years (for dropdown)
   */
  async getAcademicYears() {
    const calendars = await activityCalendarQueries.listAcademicYears()

    return success({ years: calendars })
  }

  /**
   * Get approval history for a calendar
   */
  async getApprovalHistory(calendarId) {
    const logs = await approvalLogQueries.findLogsByEntity("ActivityCalendar", calendarId)

    return success({ history: logs })
  }

  /**
   * Check overlap for a candidate event inside a calendar
   */
  async checkEventOverlap(calendarId, eventData) {
    const calendar = await activityCalendarQueries.findCalendarById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    const candidate = {
      title: eventData.title || "Untitled event",
      category: eventData.category || getDefaultCategoryDefinitions()[0].key,
      startDate: eventData.startDate,
      endDate: eventData.endDate,
    }

    const calendarEvents = await this._loadCalendarEvents(calendar._id)
    const overlapAnalysis = this._analyzeOverlaps(calendarEvents, {
      excludeEventId: eventData.eventId,
      candidateEvent: candidate,
    })

    return success({
      hasOverlap: overlapAnalysis.overlaps.length > 0,
      overlaps: overlapAnalysis.overlaps,
      overlapSummary: overlapAnalysis.summary,
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Map a GymkhanaEvent document to the calendar-event shape used by
   * validators, overlap analysis, and API responses.
   */
  _toCalendarEventShape(event) {
    return {
      _id: event._id,
      title: event.title,
      category: event.category,
      startDate: event.scheduledStartDate,
      endDate: event.scheduledEndDate,
      estimatedBudget: event.estimatedBudget,
      description: event.description,
      status: event.status,
      proposalSubmitted: event.proposalSubmitted,
      proposalId: event.proposalId,
      expenseId: event.expenseId,
      proposalDueDate: event.proposalDueDate,
    }
  }

  /**
   * Load a calendar's events from the GymkhanaEvent collection (single source of truth).
   */
  async _loadCalendarEvents(calendarId) {
    const docs = await gymkhanaEventQueries.findCalendarEventsSorted(calendarId)
    return docs.map((doc) => this._toCalendarEventShape(doc))
  }

  /**
   * Persist an incoming events array to the GymkhanaEvent collection by diffing
   * against the existing documents: update existing (matched by _id), create new
   * (no _id), and delete removed ones. Events carrying proposal/expense workflow
   * data are never deleted.
   */
  async _writeCalendarEvents(calendarId, incomingEvents = [], actor = null) {
    const incoming = Array.isArray(incomingEvents) ? incomingEvents : []
    const existing = await gymkhanaEventQueries.findCalendarEvents(calendarId)
    const existingById = new Map(existing.map((event) => [String(event._id), event]))
    const keptIds = new Set()

    // Content fields whose changes are worth auditing (skips workflow/ref fields).
    const AUDIT_FIELDS = [
      "title",
      "category",
      "scheduledStartDate",
      "scheduledEndDate",
      "estimatedBudget",
      "description",
    ]

    for (const event of incoming) {
      const payload = {
        calendarId,
        title: event.title,
        category: event.category,
        scheduledStartDate: event.startDate,
        scheduledEndDate: event.endDate,
        estimatedBudget: event.estimatedBudget,
        description: event.description,
        isMegaEvent: false,
        megaEventSeriesId: null,
      }

      const id = event._id ? String(event._id) : null
      if (id && existingById.has(id)) {
        keptIds.add(id)
        const beforeSnapshot = pickFields(existingById.get(id).toObject(), AUDIT_FIELDS)
        await gymkhanaEventOwner.updateEventById(id, payload, { new: true, runValidators: true })
        await auditService.recordUpdate({
          entityType: "GymkhanaEvent",
          entityId: id,
          before: beforeSnapshot,
          after: pickFields(payload, AUDIT_FIELDS),
          fields: AUDIT_FIELDS,
          actor,
          feature: "gymkhana-events",
        })
      } else {
        const createdEvent = await gymkhanaEventOwner.createEvent({ ...payload, status: "upcoming" })
        keptIds.add(String(createdEvent._id))
        await auditService.recordCreate({
          entityType: "GymkhanaEvent",
          entityId: createdEvent._id,
          snapshot: pickFields(payload, AUDIT_FIELDS),
          actor,
          feature: "gymkhana-events",
        })
      }
    }

    const removable = existing.filter(
      (event) =>
        !keptIds.has(String(event._id)) &&
        !event.proposalSubmitted &&
        !event.proposalId &&
        !event.expenseId
    )
    if (removable.length > 0) {
      await gymkhanaEventOwner.deleteEventsByIds(removable.map((event) => event._id))
      for (const event of removable) {
        await auditService.recordDelete({
          entityType: "GymkhanaEvent",
          entityId: event._id,
          snapshot: pickFields(event.toObject(), AUDIT_FIELDS),
          actor,
          feature: "gymkhana-events",
        })
      }
    }
  }

  async _attachResolvedCategoryDefinitions(calendar) {
    if (!calendar) return calendar

    const resolvedCategoryDefinitions = await getGlobalGymkhanaCategoryDefinitions({
      calendar,
    })
    const serializedCalendar =
      typeof calendar.toObject === "function" ? calendar.toObject() : { ...calendar }

    return {
      ...serializedCalendar,
      events: await this._loadCalendarEvents(serializedCalendar._id),
      categoryDefinitions: resolvedCategoryDefinitions,
      budgetCaps: normalizeCategoryBudgetCaps(serializedCalendar.budgetCaps, resolvedCategoryDefinitions),
    }
  }

  /**
   * Find event date overlaps in the same calendar.
   */
  _analyzeOverlaps(events = [], options = {}) {
    const { excludeEventId = null, candidateEvent = null } = options
    const filteredEvents = events.filter((event) => String(event?._id || "") !== String(excludeEventId || ""))
    const overlaps = []

    if (candidateEvent) {
      for (const existing of filteredEvents) {
        if (this._eventsOverlap(candidateEvent, existing)) {
          overlaps.push({
            eventA: this._serializeOverlapEvent(candidateEvent),
            eventB: this._serializeOverlapEvent(existing),
          })
        }
      }
    } else {
      for (let i = 0; i < filteredEvents.length; i += 1) {
        for (let j = i + 1; j < filteredEvents.length; j += 1) {
          if (this._eventsOverlap(filteredEvents[i], filteredEvents[j])) {
            overlaps.push({
              eventA: this._serializeOverlapEvent(filteredEvents[i]),
              eventB: this._serializeOverlapEvent(filteredEvents[j]),
            })
          }
        }
      }
    }

    return {
      overlaps,
      summary: {
        totalOverlaps: overlaps.length,
        hasOverlaps: overlaps.length > 0,
      },
    }
  }

  /**
   * Check overlap between two date-range events.
   */
  _eventsOverlap(eventA, eventB) {
    const rangeA = this._getEventRange(eventA)
    const rangeB = this._getEventRange(eventB)

    if (!rangeA || !rangeB) return false
    return rangeA.start <= rangeB.end && rangeB.start <= rangeA.end
  }

  _getEventRange(event) {
    const startValue = event?.startDate || event?.scheduledStartDate || event?.tentativeDate || event?.scheduledDate
    const endValue = event?.endDate || event?.scheduledEndDate || event?.tentativeDate || event?.scheduledDate
    const start = new Date(startValue)
    const end = new Date(endValue)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null
    }

    if (end < start) {
      return null
    }

    return { start, end }
  }

  _serializeOverlapEvent(event) {
    return {
      eventId: event?._id || null,
      title: event?.title || "Untitled event",
      category: event?.category || getDefaultCategoryDefinitions()[0].key,
      startDate: event?.startDate || event?.scheduledStartDate || event?.tentativeDate || event?.scheduledDate,
      endDate: event?.endDate || event?.scheduledEndDate || event?.tentativeDate || event?.scheduledDate,
      estimatedBudget: event?.estimatedBudget || 0,
    }
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

export const calendarService = new CalendarService()
export default calendarService
