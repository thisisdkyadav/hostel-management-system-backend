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
  APPROVAL_ACTIONS,
  EVENT_CATEGORY,
} from "./events.constants.js"
import { SUBROLES, ROLES } from "../../../../core/constants/roles.constants.js"

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

    const calendar = await this.model.create({
      academicYear: data.academicYear,
      events: data.events || [],
      createdBy: user._id,
      status: CALENDAR_STATUS.DRAFT,
      isLocked: false,
    })

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

    if (isGS) {
      if (calendar.status !== CALENDAR_STATUS.DRAFT && calendar.status !== CALENDAR_STATUS.REJECTED) {
        return badRequest("GS can only update draft or rejected calendars")
      }
    }

    if (
      isPresident &&
      ![
        CALENDAR_STATUS.DRAFT,
        CALENDAR_STATUS.REJECTED,
        // Backward compatibility for calendars already submitted in old flow.
        CALENDAR_STATUS.PENDING_PRESIDENT,
      ].includes(calendar.status)
    ) {
      return badRequest("President can only update calendars before Student Affairs review")
    }

    if (data.events) {
      calendar.events = data.events
    }

    if ((isGS || isPresident) && calendar.status === CALENDAR_STATUS.REJECTED) {
      calendar.status = CALENDAR_STATUS.DRAFT
      calendar.rejectionReason = null
      calendar.rejectedBy = null
      calendar.rejectedAt = null
    }

    await calendar.save()

    return success({ calendar }, 200, "Calendar updated successfully")
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

    if (calendar.status !== CALENDAR_STATUS.DRAFT) {
      return badRequest("Only draft calendars can be submitted")
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

    // President submits calendar directly to Student Affairs.
    calendar.status = CALENDAR_STATUS.PENDING_STUDENT_AFFAIRS
    calendar.currentApprovalStage = APPROVAL_STAGES.STUDENT_AFFAIRS
    await calendar.save()

    // Log the submission
    await ApprovalLog.create({
      entityType: "ActivityCalendar",
      entityId: calendar._id,
      stage: APPROVAL_STAGES.PRESIDENT_GYMKHANA,
      action: APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
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
  async approveCalendar(calendarId, comments, user) {
    const calendar = await this.model.findById(calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    // Check if user can approve at current stage
    const requiredSubRole = STATUS_TO_APPROVER[calendar.status]
    if (!requiredSubRole) {
      return badRequest("Calendar is not pending approval")
    }

    if (user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can approve at this stage`)
    }

    // Get next status
    const nextStatus = STAGE_TO_STATUS[user.subRole]
    const currentStage = user.subRole

    calendar.status = nextStatus
    
    if (nextStatus === CALENDAR_STATUS.APPROVED) {
      calendar.approvedAt = new Date()
      calendar.currentApprovalStage = null
      
      // Create individual events from calendar
      await this._createEventsFromCalendar(calendar)
    } else {
      // Set next approval stage
      const nextApprover = STATUS_TO_APPROVER[nextStatus]
      calendar.currentApprovalStage = nextApprover
    }

    await calendar.save()

    // Log the approval
    await ApprovalLog.create({
      entityType: "ActivityCalendar",
      entityId: calendar._id,
      stage: currentStage,
      action: APPROVAL_ACTIONS.APPROVED,
      performedBy: user._id,
      comments,
    })

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

    if (user.subRole !== requiredSubRole) {
      return forbidden(`Only ${requiredSubRole} can reject at this stage`)
    }

    const currentStage = user.subRole

    calendar.status = CALENDAR_STATUS.REJECTED
    calendar.rejectionReason = reason
    calendar.rejectedBy = user._id
    calendar.rejectedAt = new Date()
    calendar.currentApprovalStage = null
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

    return success({ calendar })
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

    return success({ calendar })
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
      category: eventData.category || EVENT_CATEGORY.ACADEMIC,
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
   * Create individual GymkhanaEvent documents from approved calendar
   */
  async _createEventsFromCalendar(calendar) {
    const events = calendar.events.map(event => {
      const scheduledStartDate = new Date(event.startDate)
      const proposalDueDate = new Date(scheduledStartDate)
      proposalDueDate.setDate(proposalDueDate.getDate() - 21)

      return {
      calendarId: calendar._id,
      title: event.title,
      category: event.category,
      scheduledStartDate,
      scheduledEndDate: event.endDate,
      estimatedBudget: event.estimatedBudget,
      description: event.description,
      status: "upcoming",
      proposalDueDate,
    }
    })

    await GymkhanaEvent.insertMany(events)
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
      category: event?.category || EVENT_CATEGORY.ACADEMIC,
      startDate: event?.startDate || event?.scheduledStartDate || event?.tentativeDate || event?.scheduledDate,
      endDate: event?.endDate || event?.scheduledEndDate || event?.tentativeDate || event?.scheduledDate,
      estimatedBudget: event?.estimatedBudget || 0,
    }
  }
}

export const calendarService = new CalendarService()
export default calendarService
