/**
 * @fileoverview Amendment Service
 * @description Business logic for calendar amendment requests
 */

import { BaseService } from "../../../../services/base/BaseService.js"
import {
  success,
  created,
  notFound,
  badRequest,
  forbidden,
} from "../../../../services/base/ServiceResponse.js"
import CalendarAmendment from "../../../../models/event/CalendarAmendment.model.js"
import ActivityCalendar from "../../../../models/event/ActivityCalendar.model.js"
import GymkhanaEvent from "../../../../models/event/GymkhanaEvent.model.js"
import ApprovalLog from "../../../../models/event/ApprovalLog.model.js"
import { AMENDMENT_STATUS, CALENDAR_STATUS, APPROVAL_ACTIONS, APPROVAL_STAGES } from "./events.constants.js"
import { SUBROLES, ROLES } from "../../../../core/constants/roles.constants.js"

class AmendmentService extends BaseService {
  constructor() {
    super(CalendarAmendment, "CalendarAmendment")
  }

  /**
   * Request an amendment (GS only)
   */
  async createAmendment(data, user) {
    if (user.subRole !== SUBROLES.GS_GYMKHANA) {
      return forbidden("Only GS Gymkhana can request amendments")
    }

    // For edits, verify event exists
    if (data.type === "edit" && data.eventId) {
      const event = await GymkhanaEvent.findById(data.eventId)
      if (!event) {
        return notFound("Event to edit")
      }
      data.calendarId = event.calendarId
    } else if (data.type === "new_event") {
      // Get current approved calendar
      const calendar = await ActivityCalendar.findOne({ status: CALENDAR_STATUS.APPROVED })
        .sort({ createdAt: -1 })
      if (!calendar) {
        return badRequest("No approved calendar exists to add events to")
      }
      data.calendarId = calendar._id
    }

    const amendment = await this.model.create({
      ...data,
      requestedBy: user._id,
      status: AMENDMENT_STATUS.PENDING,
    })

    // Log amendment request
    await ApprovalLog.create({
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

    const amendment = await this.model.findById(amendmentId)
    if (!amendment) {
      return notFound("Amendment")
    }

    if (amendment.status !== AMENDMENT_STATUS.PENDING) {
      return badRequest("Amendment is not pending")
    }

    amendment.status = AMENDMENT_STATUS.APPROVED
    amendment.reviewedBy = user._id
    amendment.reviewedAt = new Date()
    amendment.reviewComments = reviewComments
    await amendment.save()

    // Apply the amendment
    if (amendment.type === "edit") {
      await GymkhanaEvent.findByIdAndUpdate(amendment.eventId, {
        title: amendment.proposedChanges.title,
        category: amendment.proposedChanges.category,
        scheduledStartDate: amendment.proposedChanges.startDate,
        scheduledEndDate: amendment.proposedChanges.endDate,
        estimatedBudget: amendment.proposedChanges.estimatedBudget,
        description: amendment.proposedChanges.description,
      })
    } else if (amendment.type === "new_event") {
      await GymkhanaEvent.create({
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

    const reviewStage = user.subRole || APPROVAL_STAGES.STUDENT_AFFAIRS

    // Log approval
    await ApprovalLog.create({
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

    const amendment = await this.model.findById(amendmentId)
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
    await amendment.save()

    const reviewStage = user.subRole || APPROVAL_STAGES.STUDENT_AFFAIRS

    // Log rejection
    await ApprovalLog.create({
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
    const amendments = await this.model.find({ status: AMENDMENT_STATUS.PENDING })
      .populate("requestedBy", "name email")
      .populate("eventId", "title")
      .sort({ createdAt: -1 })

    return success({ amendments })
  }

  /**
   * Get amendments by calendar
   */
  async getAmendmentsByCalendar(calendarId) {
    const amendments = await this.model.find({ calendarId })
      .populate("requestedBy", "name email")
      .populate("reviewedBy", "name email")
      .sort({ createdAt: -1 })

    return success({ amendments })
  }
}

export const amendmentService = new AmendmentService()
export default amendmentService
