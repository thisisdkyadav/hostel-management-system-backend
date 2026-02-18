/**
 * @fileoverview Mega Events Service
 * @description Business logic for recurring mega event series and occurrences.
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
import GymkhanaEvent from "../../../../models/event/GymkhanaEvent.model.js"
import { EVENT_STATUS, EVENT_CATEGORY } from "./events.constants.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"

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

  async getSeries() {
    const series = await this.model.find({ isActive: true }).sort({ name: 1 })

    const summary = await Promise.all(
      series.map(async (entry) => {
        const latestOccurrence = await GymkhanaEvent.findOne({
          megaEventSeriesId: entry._id,
          isMegaEvent: true,
        })
          .sort({ scheduledStartDate: -1, scheduledEndDate: -1, createdAt: -1 })
          .select("title status scheduledStartDate scheduledEndDate proposalSubmitted proposalId expenseId")

        const occurrencesCount = await GymkhanaEvent.countDocuments({
          megaEventSeriesId: entry._id,
          isMegaEvent: true,
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

    const occurrences = await GymkhanaEvent.find({
      megaEventSeriesId: series._id,
      isMegaEvent: true,
    })
      .populate("proposalId")
      .populate("expenseId")
      .sort({ scheduledStartDate: -1, scheduledEndDate: -1, createdAt: -1 })

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

    const event = await GymkhanaEvent.create({
      calendarId: null,
      title: series.name,
      category: EVENT_CATEGORY.CULTURAL,
      scheduledStartDate: startDate,
      scheduledEndDate: endDate,
      estimatedBudget: 0,
      description:
        String(series.description || "").trim() ||
        `${series.name} mega event occurrence`,
      status: EVENT_STATUS.PROPOSAL_PENDING,
      proposalSubmitted: false,
      isMegaEvent: true,
      megaEventSeriesId: series._id,
    })

    return created({ event }, "Mega event occurrence created")
  }
}

export const megaEventsService = new MegaEventsService()
export default megaEventsService
