/**
 * @fileoverview Calendar Service
 * @description Business logic for Activity Calendar management
 * Admin creates/locks calendars, Gymkhana users edit (if unlocked) or request amendments (if locked)
 */

import { BaseService } from "../../../../services/base/BaseService.js"
import {
  success,
  created,
  notFound,
  badRequest,
  forbidden,
} from "../../../../services/base/ServiceResponse.js"
import ActivityCalendar from "../../../../models/event/ActivityCalendar.model.js"
import GymkhanaEvent from "../../../../models/event/GymkhanaEvent.model.js"
import ApprovalLog from "../../../../models/event/ApprovalLog.model.js"
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
import { normalizeCategoryBudgetCaps, validateCategoryBudgetCaps } from "./budget-caps.utils.js"
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
import { notifyAssignedApproverByEmail } from "./approval-email.utils.js"

class CalendarService extends BaseService {
  constructor() {
    super(ActivityCalendar, "ActivityCalendar")
  }

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
    const existing = await this.model.findOne({ academicYear: data.academicYear })
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

    const calendar = await this.model.create({
      academicYear: data.academicYear,
      events: data.events || [],
      allowProposalBeforeApproval: Boolean(data.allowProposalBeforeApproval),
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

    if (calendar.allowProposalBeforeApproval && Array.isArray(calendar.events) && calendar.events.length > 0) {
      await this._syncGymkhanaEventsForCalendar(calendar)
    }

    return created({ calendar }, "Activity calendar created")
  }

  /**
   * Lock calendar (Admin only) - prevents GS from editing
   */
  async lockCalendar(calendarId, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only Admin can lock calendars")
    }

    const calendar = await this.model.findById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    if (calendar.isLocked) {
      return badRequest("Calendar is already locked")
    }

    calendar.isLocked = true
    calendar.lockedBy = user._id
    calendar.lockedAt = new Date()
    await calendar.save()

    return success({ calendar }, 200, "Calendar locked successfully")
  }

  /**
   * Unlock calendar (Admin only) - allows GS to edit
   */
  async unlockCalendar(calendarId, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only Admin can unlock calendars")
    }

    const calendar = await this.model.findById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    if (!calendar.isLocked) {
      return badRequest("Calendar is already unlocked")
    }

    calendar.isLocked = false
    calendar.lockedBy = null
    calendar.lockedAt = null
    await calendar.save()

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
    const calendar = await this.model.findById(calendarId)
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
      CALENDAR_STATUS.PENDING_JOINT_REGISTRAR,
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

      calendar.events = data.events
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

    await calendar.save()

    if (calendar.status === CALENDAR_STATUS.APPROVED || calendar.allowProposalBeforeApproval) {
      await this._syncGymkhanaEventsForCalendar(calendar)
    }

    return success({ calendar }, 200, "Calendar updated successfully")
  }

  async updateCalendarSettings(calendarId, data, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only Admin can update calendar settings")
    }

    const calendar = await this.model.findById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    const previousAllowProposalBeforeApproval = Boolean(calendar.allowProposalBeforeApproval)
    const nextAllowProposalBeforeApproval =
      typeof data.allowProposalBeforeApproval === "boolean"
        ? data.allowProposalBeforeApproval
        : previousAllowProposalBeforeApproval
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

    if (!allowProposalSettingChanged && !budgetCapsChanged) {
      return success({ calendar }, 200, "Calendar settings updated successfully")
    }

    const categoryValidation = validateEventCategories(calendar.events || [], nextCategoryDefinitions)
    if (!categoryValidation.success) {
      return badRequest(categoryValidation.message)
    }

    const budgetCapValidation = validateCategoryBudgetCaps(
      calendar.events || [],
      nextBudgetCaps,
      nextCategoryDefinitions
    )
    if (!budgetCapValidation.success) {
      return badRequest(`Cannot update calendar settings. ${budgetCapValidation.message}`)
    }

    if (
      allowProposalSettingChanged &&
      !nextAllowProposalBeforeApproval &&
      calendar.status !== CALENDAR_STATUS.APPROVED
    ) {
      const linkedEvents = await GymkhanaEvent.find({
        calendarId: calendar._id,
        isMegaEvent: false,
      }).select("_id proposalSubmitted proposalId expenseId")

      const hasWorkflowData = linkedEvents.some(
        (event) => event.proposalSubmitted || event.proposalId || event.expenseId
      )

      if (hasWorkflowData) {
        return badRequest(
          "Cannot disable early proposal submission because this calendar already has linked proposal or expense data"
        )
      }

      if (linkedEvents.length > 0) {
        await GymkhanaEvent.deleteMany({
          calendarId: calendar._id,
          isMegaEvent: false,
          proposalSubmitted: false,
          $or: [
            { proposalId: { $exists: false }, expenseId: { $exists: false } },
            { proposalId: null, expenseId: null },
          ],
        })
      }
    }

    calendar.allowProposalBeforeApproval = nextAllowProposalBeforeApproval
    calendar.budgetCaps = nextBudgetCaps
    await calendar.save()

    if (allowProposalSettingChanged && nextAllowProposalBeforeApproval) {
      await this._syncGymkhanaEventsForCalendar(calendar)
    }

    return success({ calendar }, 200, "Calendar settings updated successfully")
  }

  /**
   * Submit calendar for approval (President only)
   */
  async submitCalendar(calendarId, user, options = {}) {
    const { allowOverlappingDates = false } = options

    const calendar = await this.model.findById(calendarId)
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
      CALENDAR_STATUS.PENDING_JOINT_REGISTRAR,
      CALENDAR_STATUS.PENDING_ASSOCIATE_DEAN,
      CALENDAR_STATUS.PENDING_DEAN,
      CALENDAR_STATUS.APPROVED,
    ]

    if (!submittableStatuses.includes(calendar.status)) {
      return badRequest("This calendar cannot be submitted in its current status")
    }

    if (!calendar.events || calendar.events.length === 0) {
      return badRequest("Calendar must have at least one event")
    }

    const overlapAnalysis = this._analyzeOverlaps(calendar.events)
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
    await calendar.save()

    // Log the submission
    await ApprovalLog.create({
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
  async approveCalendar(calendarId, comments, user, nextApprovalStages = [], nextApprovers = []) {
    const calendar = await this.model.findById(calendarId)
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

      calendar.customApprovalChain = chain
      calendar.customApprovalAssignments = assignmentResolution.assignments
      calendar.currentChainIndex = 0
      calendar.status = nextStatus
      calendar.currentApprovalStage = firstStage
      calendar.currentApproverUser = assignmentResolution.currentApproverUser
      notifyNextApprover = assignmentResolution.assignments.length > 0
      nextApproverUserId = assignmentResolution.currentApproverUser
      nextApproverStage = firstStage
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
      
      // Create individual events from calendar
      await this._syncGymkhanaEventsForCalendar(calendar)
    } else {
      calendar.isLocked = true
      calendar.lockedBy = user._id
      calendar.lockedAt = new Date()
    }

    await calendar.save()

    // Log the approval
    await ApprovalLog.create({
      entityType: "ActivityCalendar",
      entityId: calendar._id,
      stage: currentStage,
      action: APPROVAL_ACTIONS.APPROVED,
      performedBy: user._id,
      comments: normalizedComments,
    })

    if (notifyNextApprover && nextApproverUserId && nextApproverStage) {
      await notifyAssignedApproverByEmail({
        entityType: "ActivityCalendar",
        entityId: calendar._id,
        entityLabel: calendar.academicYear,
        nextApproverUserId,
        nextApproverStage,
        approvedBy: user.name,
        approvedByStage: currentStage,
        comments: normalizedComments,
      })
    }

    return success({ calendar }, 200, "Calendar approved successfully")
  }

  /**
   * Reject calendar
   */
  async rejectCalendar(calendarId, reason, user) {
    const calendar = await this.model.findById(calendarId)
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
    await calendar.save()

    // Log the rejection
    await ApprovalLog.create({
      entityType: "ActivityCalendar",
      entityId: calendar._id,
      stage: currentStage,
      action: APPROVAL_ACTIONS.REJECTED,
      performedBy: user._id,
      comments: reason,
    })

    return success({ calendar }, 200, "Calendar rejected")
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READ OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get calendar by ID
   */
  async getCalendarById(calendarId) {
    const calendar = await this.model.findById(calendarId)
      .populate("createdBy", "name email")
      .populate("rejectedBy", "name email")
      .populate("lockedBy", "name email")

    if (!calendar) {
      return notFound("Activity calendar")
    }

    return success({ calendar: await this._attachResolvedCategoryDefinitions(calendar) })
  }

  /**
   * Get calendar by academic year
   */
  async getCalendarByYear(year) {
    const calendar = await this.model.findOne({ academicYear: year })
      .populate("createdBy", "name email")
      .populate("lockedBy", "name email")

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

    return this.findPaginated(filter, { page, limit })
  }

  /**
   * Get all academic years (for dropdown)
   */
  async getAcademicYears() {
    const calendars = await this.model.find({}, "academicYear status isLocked")
      .sort({ academicYear: -1 })
    
    return success({ years: calendars })
  }

  /**
   * Get approval history for a calendar
   */
  async getApprovalHistory(calendarId) {
    const logs = await ApprovalLog.find({
      entityType: "ActivityCalendar",
      entityId: calendarId,
    })
      .sort({ createdAt: 1 })
      .populate("performedBy", "name email subRole")

    return success({ history: logs })
  }

  /**
   * Check overlap for a candidate event inside a calendar
   */
  async checkEventOverlap(calendarId, eventData) {
    const calendar = await this.model.findById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    const candidate = {
      title: eventData.title || "Untitled event",
      category: eventData.category || getDefaultCategoryDefinitions()[0].key,
      startDate: eventData.startDate,
      endDate: eventData.endDate,
    }

    const overlapAnalysis = this._analyzeOverlaps(calendar.events, {
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
   * Sync calendar events into GymkhanaEvent documents.
   */
  async _syncGymkhanaEventsForCalendar(calendar) {
    const calendarEvents = Array.isArray(calendar?.events) ? calendar.events : []
    if (calendarEvents.length === 0) {
      return
    }

    const existingEvents = await GymkhanaEvent.find({
      calendarId: calendar._id,
      isMegaEvent: false,
    })

    const existingByCalendarEventId = new Map()
    const fallbackBuckets = new Map()

    for (const existingEvent of existingEvents) {
      if (existingEvent.calendarEventId) {
        existingByCalendarEventId.set(String(existingEvent.calendarEventId), existingEvent)
        continue
      }

      const fallbackKey = this._buildCalendarEventSyncKey(existingEvent)
      if (!fallbackBuckets.has(fallbackKey)) {
        fallbackBuckets.set(fallbackKey, [])
      }
      fallbackBuckets.get(fallbackKey).push(existingEvent)
    }

    for (const calendarEvent of calendarEvents) {
      const calendarEventId = calendarEvent?._id ? String(calendarEvent._id) : null
      let matchingEvent = calendarEventId ? existingByCalendarEventId.get(calendarEventId) : null

      if (!matchingEvent) {
        const fallbackKey = this._buildCalendarEventSyncKey(calendarEvent)
        const bucket = fallbackBuckets.get(fallbackKey) || []
        matchingEvent = bucket.shift() || null
      }

      const scheduledStartDate = new Date(calendarEvent.startDate)
      const proposalDueDate = new Date(scheduledStartDate)
      proposalDueDate.setDate(proposalDueDate.getDate() - 21)

      const payload = {
        calendarId: calendar._id,
        ...(calendarEvent._id ? { calendarEventId: calendarEvent._id } : {}),
        title: calendarEvent.title,
        category: calendarEvent.category,
        scheduledStartDate,
        scheduledEndDate: calendarEvent.endDate,
        estimatedBudget: calendarEvent.estimatedBudget,
        description: calendarEvent.description,
        proposalDueDate,
        isMegaEvent: false,
        megaEventSeriesId: null,
      }

      if (matchingEvent) {
        await GymkhanaEvent.findByIdAndUpdate(matchingEvent._id, payload, {
          new: true,
          runValidators: true,
        })
      } else {
        await GymkhanaEvent.create({
          ...payload,
          status: "upcoming",
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

  _buildCalendarEventSyncKey(event) {
    const startDate = event?.startDate || event?.scheduledStartDate
    const endDate = event?.endDate || event?.scheduledEndDate
    return [
      event?.title || "",
      event?.category || getDefaultCategoryDefinitions()[0].key,
      this._normalizeSyncDate(startDate),
      this._normalizeSyncDate(endDate),
    ].join("|")
  }

  _normalizeSyncDate(value) {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10)
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

export const calendarService = new CalendarService()
export default calendarService
