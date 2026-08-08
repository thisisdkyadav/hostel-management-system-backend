/**
 * @fileoverview Amendment Service
 * @description Business logic for calendar amendment requests
 */

import {
  success,
  created,
  notFound,
  badRequest,
  forbidden,
} from "../../../../services/base/ServiceResponse.js"
import { calendarAmendmentOwner } from "../../../../services/gymkhana/calendarAmendmentOwner.service.js"
import { calendarAmendmentQueries } from "../../../../services/gymkhana/calendarAmendmentQueries.service.js"
import { activityCalendarQueries } from "../../../../services/gymkhana/activityCalendarQueries.service.js"
import { gymkhanaEventOwner } from "../../../../services/gymkhana/gymkhanaEventOwner.service.js"
import { gymkhanaEventQueries } from "../../../../services/gymkhana/gymkhanaEventQueries.service.js"
import { approvalLogOwner } from "../../../../services/gymkhana/approvalLogOwner.service.js"
import { AMENDMENT_STATUS, CALENDAR_STATUS, APPROVAL_ACTIONS, APPROVAL_STAGES } from "./events.constants.js"
import { SUBROLES, ROLES } from "../../../../core/constants/roles.constants.js"
import { validateCategoryBudgetCaps } from "./budget-caps.utils.js"
import {
  getGlobalGymkhanaCategoryDefinitions,
  validateEventCategories,
} from "./category-definitions.utils.js"

class AmendmentService {
  /**
   * Request an amendment (GS only)
   */
  async createAmendment(data, user) {
    if (user.subRole !== SUBROLES.GS_GYMKHANA) {
      return forbidden("Only GS Gymkhana can request amendments")
    }

    // For edits, verify event exists
    if (data.type === "edit" && data.eventId) {
      const event = await gymkhanaEventQueries.findEventById(data.eventId)
      if (!event) {
        return notFound("Event to edit")
      }
      data.calendarId = event.calendarId
    } else if (data.type === "new_event") {
      // Get current approved calendar
      const calendar = await activityCalendarQueries.findLatestCalendarByStatus(CALENDAR_STATUS.APPROVED)
      if (!calendar) {
        return badRequest("No approved calendar exists to add events to")
      }
      data.calendarId = calendar._id
    }

    const amendment = await calendarAmendmentOwner.createAmendment({
      ...data,
      requestedBy: user._id,
      status: AMENDMENT_STATUS.PENDING,
    })

    // Log amendment request
    await approvalLogOwner.createLog({
      entityType: "CalendarAmendment",
      entityId: amendment._id,
      stage: SUBROLES.GS_GYMKHANA,
      action: APPROVAL_ACTIONS.SUBMITTED,
      performedBy: user._id,
    })

    return created({ amendment }, "Amendment request submitted")
  }

  /**
   * Approve amendment (Admin only)
   */
  async approveAmendment(amendmentId, reviewComments, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can approve amendments")
    }

    const amendment = await calendarAmendmentQueries.findAmendmentById(amendmentId)
    if (!amendment) {
      return notFound("Amendment")
    }

    if (amendment.status !== AMENDMENT_STATUS.PENDING) {
      return badRequest("Amendment is not pending")
    }

    const calendar = await activityCalendarQueries.findCalendarById(amendment.calendarId)
    if (!calendar) {
      return notFound("Activity calendar")
    }

    const categoryDefinitions = await getGlobalGymkhanaCategoryDefinitions({
      calendar,
    })

    // Load the calendar's events from the GymkhanaEvent collection (single source of truth)
    const calendarEvents = (
      await gymkhanaEventQueries.findCalendarEvents(calendar._id)
    ).map((event) => ({
      _id: event._id,
      title: event.title,
      category: event.category,
      startDate: event.scheduledStartDate,
      endDate: event.scheduledEndDate,
      estimatedBudget: event.estimatedBudget,
      description: event.description,
    }))

    if (amendment.type === "edit") {
      const linkedEvent = await gymkhanaEventQueries.findEventById(amendment.eventId)
      if (!linkedEvent) {
        return notFound("Event to edit")
      }

      // Validate the event set with the proposed change applied
      const updatedEvents = calendarEvents.map((event) =>
        String(event._id) === String(linkedEvent._id)
          ? {
              ...event,
              title: amendment.proposedChanges.title,
              category: amendment.proposedChanges.category,
              startDate: amendment.proposedChanges.startDate,
              endDate: amendment.proposedChanges.endDate,
              estimatedBudget: amendment.proposedChanges.estimatedBudget,
              description: amendment.proposedChanges.description,
            }
          : event
      )

      const categoryValidation = validateEventCategories(updatedEvents, categoryDefinitions)
      if (!categoryValidation.success) {
        return badRequest(categoryValidation.message)
      }

      const budgetCapValidation = validateCategoryBudgetCaps(
        updatedEvents,
        calendar.budgetCaps,
        categoryDefinitions
      )
      if (!budgetCapValidation.success) {
        return badRequest(budgetCapValidation.message)
      }

      linkedEvent.title = amendment.proposedChanges.title
      linkedEvent.category = amendment.proposedChanges.category
      linkedEvent.scheduledStartDate = amendment.proposedChanges.startDate
      linkedEvent.scheduledEndDate = amendment.proposedChanges.endDate
      linkedEvent.estimatedBudget = amendment.proposedChanges.estimatedBudget
      linkedEvent.description = amendment.proposedChanges.description
      await gymkhanaEventOwner.persistEvent(linkedEvent)
    } else if (amendment.type === "new_event") {
      const updatedEvents = [...calendarEvents, amendment.proposedChanges]
      const categoryValidation = validateEventCategories(updatedEvents, categoryDefinitions)
      if (!categoryValidation.success) {
        return badRequest(categoryValidation.message)
      }

      const budgetCapValidation = validateCategoryBudgetCaps(
        updatedEvents,
        calendar.budgetCaps,
        categoryDefinitions
      )
      if (!budgetCapValidation.success) {
        return badRequest(budgetCapValidation.message)
      }

      await gymkhanaEventOwner.createEvent({
        calendarId: amendment.calendarId,
        title: amendment.proposedChanges.title,
        category: amendment.proposedChanges.category,
        scheduledStartDate: amendment.proposedChanges.startDate,
        scheduledEndDate: amendment.proposedChanges.endDate,
        estimatedBudget: amendment.proposedChanges.estimatedBudget,
        description: amendment.proposedChanges.description,
        status: "upcoming",
      })
    }

    amendment.status = AMENDMENT_STATUS.APPROVED
    amendment.reviewedBy = user._id
    amendment.reviewedAt = new Date()
    amendment.reviewComments = reviewComments
    await calendarAmendmentOwner.persistAmendment(amendment)

    const reviewStage = user.subRole || APPROVAL_STAGES.STUDENT_AFFAIRS

    // Log approval
    await approvalLogOwner.createLog({
      entityType: "CalendarAmendment",
      entityId: amendment._id,
      stage: reviewStage,
      action: APPROVAL_ACTIONS.APPROVED,
      performedBy: user._id,
      comments: reviewComments,
    })

    return success({ amendment }, 200, "Amendment approved and applied")
  }

  /**
   * Reject amendment (Admin only)
   */
  async rejectAmendment(amendmentId, reviewComments, user) {
    if (user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      return forbidden("Only admins can reject amendments")
    }

    const amendment = await calendarAmendmentQueries.findAmendmentById(amendmentId)
    if (!amendment) {
      return notFound("Amendment")
    }

    if (amendment.status !== AMENDMENT_STATUS.PENDING) {
      return badRequest("Amendment is not pending")
    }

    amendment.status = AMENDMENT_STATUS.REJECTED
    amendment.reviewedBy = user._id
    amendment.reviewedAt = new Date()
    amendment.reviewComments = reviewComments
    await calendarAmendmentOwner.persistAmendment(amendment)

    const reviewStage = user.subRole || APPROVAL_STAGES.STUDENT_AFFAIRS

    // Log rejection
    await approvalLogOwner.createLog({
      entityType: "CalendarAmendment",
      entityId: amendment._id,
      stage: reviewStage,
      action: APPROVAL_ACTIONS.REJECTED,
      performedBy: user._id,
      comments: reviewComments,
    })

    return success({ amendment }, 200, "Amendment rejected")
  }

  /**
   * Get pending amendments (Admin view)
   */
  async getPendingAmendments() {
    const amendments = await calendarAmendmentQueries.findAmendmentsByStatus(AMENDMENT_STATUS.PENDING)

    return success({ amendments })
  }

  /**
   * Get amendments by calendar
   */
  async getAmendmentsByCalendar(calendarId) {
    const amendments = await calendarAmendmentQueries.findAmendmentsByCalendar(calendarId)

    return success({ amendments })
  }
}

export const amendmentService = new AmendmentService()
export default amendmentService
