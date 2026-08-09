import crypto from "crypto"
import mongoose from "mongoose"
import { studentProfileQueries } from "../student/studentProfileQueries.service.js"
import { allocationQueries } from "./allocationQueries.service.js"
import { diningOwner } from "./diningOwner.service.js"
import { diningQueries } from "./diningQueries.service.js"
import { badRequest, notFound, success } from "../base/index.js"

const APPROVED_STATUS = "approved"
const PENDING_STATUS = "pending"
const REJECTED_STATUS = "rejected"
const SHORT_TERM_TYPE = "short-term"
const LONG_TERM_TYPE = "long-term"

const DEFAULT_REBATE_SETTINGS = {
  shortTermMaxTotalDays: 10,
  shortTermMaxContinuousDays: 3,
  shortTermMinApplicationDays: 1,
  shortTermMinAdvanceDays: 2,
}

const DAY_MS = 24 * 60 * 60 * 1000

export const normalizeDay = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export const getDayKey = (value) => {
  const day = normalizeDay(value)
  return day ? day.toISOString().slice(0, 10) : ""
}

const addDays = (value, days) => new Date(normalizeDay(value).getTime() + days * DAY_MS)

export const listDayKeys = (startDate, endDate) => {
  const start = normalizeDay(startDate)
  const end = normalizeDay(endDate)
  if (!start || !end || start > end) return []

  const keys = []
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    keys.push(getDayKey(cursor))
  }
  return keys
}

const normalizeRebateSettings = (settings = {}) => {
  const numberOrDefault = (value, fallback) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
  }

  return {
    shortTermMaxTotalDays: Math.max(0, Math.floor(numberOrDefault(settings.shortTermMaxTotalDays, DEFAULT_REBATE_SETTINGS.shortTermMaxTotalDays))),
    shortTermMaxContinuousDays: Math.max(1, Math.floor(numberOrDefault(settings.shortTermMaxContinuousDays, DEFAULT_REBATE_SETTINGS.shortTermMaxContinuousDays))),
    shortTermMinApplicationDays: Math.max(1, Math.floor(numberOrDefault(settings.shortTermMinApplicationDays, DEFAULT_REBATE_SETTINGS.shortTermMinApplicationDays))),
    shortTermMinAdvanceDays: Math.max(0, Math.floor(numberOrDefault(settings.shortTermMinAdvanceDays, DEFAULT_REBATE_SETTINGS.shortTermMinAdvanceDays))),
  }
}

const serializeCaterer = (caterer = null) => {
  if (!caterer) return null
  return {
    id: caterer._id || caterer.id,
    name: caterer.name,
    email: caterer.email,
  }
}

const serializeStudent = (profile = null) => {
  if (!profile) return null
  const user = profile.userId && typeof profile.userId === "object" ? profile.userId : null

  return {
    id: profile.userId?._id || profile.userId || null,
    profileId: profile._id || profile.id,
    name: user?.name || "",
    email: user?.email || "",
    rollNumber: profile.rollNumber,
  }
}

const serializePeriod = (period = null) => {
  if (!period) return null
  return {
    id: period._id || period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    rebateSettings: normalizeRebateSettings(period.rebateSettings),
  }
}

export const serializeDiningRebate = (rebate = {}) => ({
  id: rebate._id || rebate.id,
  requestGroupId: rebate.requestGroupId,
  periodId: rebate.periodId?._id || rebate.periodId,
  period: serializePeriod(rebate.periodId && typeof rebate.periodId === "object" ? rebate.periodId : null),
  catererId: rebate.catererId?._id || rebate.catererId,
  caterer: serializeCaterer(rebate.catererId && typeof rebate.catererId === "object" ? rebate.catererId : null),
  studentUserId: rebate.studentUserId?._id || rebate.studentUserId,
  student: serializeStudent(rebate.studentProfileId && typeof rebate.studentProfileId === "object" ? rebate.studentProfileId : null),
  rollNumber: rebate.rollNumber,
  startDate: rebate.startDate,
  endDate: rebate.endDate,
  dateKeys: Array.isArray(rebate.dateKeys) ? rebate.dateKeys : [],
  dayCount: Number(rebate.dayCount || 0),
  type: rebate.type,
  status: rebate.status,
  reason: rebate.reason || "",
  adminComment: rebate.adminComment || "",
  approvedAt: rebate.approvedAt,
  rejectedAt: rebate.rejectedAt,
  createdAt: rebate.createdAt,
  updatedAt: rebate.updatedAt,
})

const getStudentProfileForUser = async (userId) => (
  studentProfileQueries.findByUserId(userId, { select: "_id userId rollNumber status", lean: true })
)

const getPeriodsForRange = async (startDate, endDate) => (
  diningQueries.findPeriods(
    {
      isArchived: false,
      startDate: { $lte: endDate },
      endDate: { $gte: startDate },
    },
    { sort: { startDate: 1 }, lean: true },
  )
)

const getSegmentForPeriod = ({ period, requestedKeys }) => {
  const periodKeys = new Set(listDayKeys(period.startDate, period.endDate))
  const segmentKeys = requestedKeys.filter((key) => periodKeys.has(key))
  if (segmentKeys.length === 0) return null

  return {
    period,
    dateKeys: segmentKeys,
    startDate: normalizeDay(segmentKeys[0]),
    endDate: normalizeDay(segmentKeys[segmentKeys.length - 1]),
    dayCount: segmentKeys.length,
  }
}

const ensureNoRebateOverlap = async ({ studentUserId, periodId, dateKeys, excludeRebateId = null }) => {
  const query = {
    studentUserId,
    periodId,
    dateKeys: { $in: dateKeys },
    status: { $in: [APPROVED_STATUS, PENDING_STATUS] },
  }
  if (excludeRebateId) query._id = { $ne: excludeRebateId }

  const overlap = await diningQueries.findOneRebate(query, { select: "_id", lean: true })
  return !overlap
}

const countApprovedShortTermDays = async ({ studentUserId, periodId }) => {
  const rebates = await diningQueries.findRebates(
    {
      studentUserId,
      periodId,
      type: SHORT_TERM_TYPE,
      status: APPROVED_STATUS,
    },
    { select: "dateKeys dayCount", lean: true },
  )

  const dateKeys = new Set()
  rebates.forEach((rebate) => {
    if (Array.isArray(rebate.dateKeys) && rebate.dateKeys.length > 0) {
      rebate.dateKeys.forEach((key) => dateKeys.add(key))
    } else {
      for (const key of listDayKeys(rebate.startDate, rebate.endDate)) dateKeys.add(key)
    }
  })

  return dateKeys.size
}

const buildValidatedRebateSegments = async ({ userId, startDate, endDate, reason = "" }) => {
  const profile = await getStudentProfileForUser(userId)
  if (!profile) return { response: notFound("Student profile") }
  if (profile.status !== "Active") return { response: badRequest("Only active students can request dining rebates") }

  const startDay = normalizeDay(startDate)
  const endDay = normalizeDay(endDate)
  if (!startDay || !endDay) return { response: badRequest("Valid rebate start and end dates are required") }
  if (startDay > endDay) return { response: badRequest("Rebate start date must be before or equal to end date") }

  const requestedKeys = listDayKeys(startDay, endDay)
  if (requestedKeys.length === 0) return { response: badRequest("Please select at least one rebate day") }

  const periods = await getPeriodsForRange(startDay, endDay)
  if (periods.length === 0) return { response: badRequest("No dining period is configured for the selected dates") }

  const periodSegments = periods
    .map((period) => getSegmentForPeriod({ period, requestedKeys }))
    .filter(Boolean)

  const coveredKeys = new Set(periodSegments.flatMap((segment) => segment.dateKeys))
  const uncoveredKeys = requestedKeys.filter((key) => !coveredKeys.has(key))
  if (uncoveredKeys.length > 0) {
    return { response: badRequest("Selected dates include days without a dining period") }
  }

  const periodIds = periodSegments.map((segment) => segment.period._id)
  const allocations = await allocationQueries.findAllocationsByUserAndPeriods(userId, periodIds)
  const allocationByPeriod = new Map(allocations.map((allocation) => [String(allocation.periodId), allocation]))

  const missingAllocation = periodSegments.find((segment) => !allocationByPeriod.has(String(segment.period._id)))
  if (missingAllocation) {
    return {
      response: badRequest("Please select your caterer for the next dining period before requesting cross-period rebates"),
    }
  }

  const segments = []
  const nowDay = normalizeDay(new Date())

  for (const segment of periodSegments) {
    const allocation = allocationByPeriod.get(String(segment.period._id))
    const settings = normalizeRebateSettings(segment.period.rebateSettings)
    const isLongTerm = segment.dayCount > settings.shortTermMaxContinuousDays
    const type = isLongTerm ? LONG_TERM_TYPE : SHORT_TERM_TYPE
    const status = isLongTerm ? PENDING_STATUS : APPROVED_STATUS

    const hasNoOverlap = await ensureNoRebateOverlap({
      studentUserId: userId,
      periodId: segment.period._id,
      dateKeys: segment.dateKeys,
    })
    if (!hasNoOverlap) {
      return { response: badRequest("One or more selected days already have a rebate request") }
    }

    if (!isLongTerm) {
      if (segment.dayCount < settings.shortTermMinApplicationDays) {
        return { response: badRequest(`Short-term rebate must be at least ${settings.shortTermMinApplicationDays} day(s) for this period`) }
      }

      const earliestAllowedDay = addDays(nowDay, settings.shortTermMinAdvanceDays)
      if (segment.startDate < earliestAllowedDay) {
        return { response: badRequest(`Short-term rebate must be requested at least ${settings.shortTermMinAdvanceDays} day(s) in advance`) }
      }

      const usedDays = await countApprovedShortTermDays({
        studentUserId: userId,
        periodId: segment.period._id,
      })
      if (usedDays + segment.dayCount > settings.shortTermMaxTotalDays) {
        return { response: badRequest(`Short-term rebate limit exceeded for this period. Available days: ${Math.max(settings.shortTermMaxTotalDays - usedDays, 0)}`) }
      }
    }

    segments.push({
      period: segment.period,
      allocation,
      startDate: segment.startDate,
      endDate: segment.endDate,
      dateKeys: segment.dateKeys,
      dayCount: segment.dayCount,
      type,
      status,
      reason: String(reason || "").trim(),
      studentUserId: userId,
      studentProfileId: profile._id,
      rollNumber: profile.rollNumber,
      catererId: allocation.catererId,
      approvedAt: status === APPROVED_STATUS ? new Date() : null,
    })
  }

  return { profile, segments }
}

export const createStudentDiningRebate = async ({ userId, payload = {} }) => {
  const validation = await buildValidatedRebateSegments({
    userId,
    startDate: payload.startDate,
    endDate: payload.endDate,
    reason: payload.reason,
  })

  if (validation.response) return validation.response

  const requestGroupId = crypto.randomUUID()
  const created = await diningOwner.insertRebates(
    validation.segments.map((segment) => ({
      ...segment,
      requestGroupId,
    }))
  )

  const populated = await diningQueries.findRebatesPopulated(
    { _id: { $in: created.map((rebate) => rebate._id) } },
    { sort: { startDate: 1 }, lean: true },
  )
  const hasPending = populated.some((rebate) => rebate.status === PENDING_STATUS)

  return success(
    { rebates: populated.map(serializeDiningRebate) },
    201,
    hasPending
      ? "Long-term rebate request submitted for admin approval"
      : "Short-term rebate approved successfully",
  )
}

export const getStudentDiningRebates = async ({ userId }) => {
  const rebates = await diningQueries.findRebatesPopulated(
    { studentUserId: userId },
    { sort: { startDate: -1, createdAt: -1 }, limit: 100, lean: true },
  )

  return success({ rebates: rebates.map(serializeDiningRebate) })
}

export const getAdminDiningRebates = async ({ status = "" } = {}) => {
  const query = {}
  if ([APPROVED_STATUS, PENDING_STATUS, REJECTED_STATUS].includes(String(status).trim())) {
    query.status = String(status).trim()
  }

  const rebates = await diningQueries.findRebatesPopulated(
    query,
    { sort: { status: -1, startDate: 1, createdAt: -1 }, limit: 200, lean: true },
  )

  return success({ rebates: rebates.map(serializeDiningRebate) })
}

export const approveDiningRebate = async ({ rebateId, adminUserId }) => {
  if (!mongoose.Types.ObjectId.isValid(rebateId)) return badRequest("Invalid rebate request")

  const rebate = await diningQueries.findRebateById(rebateId)
  if (!rebate) return notFound("Dining rebate")
  if (rebate.status !== PENDING_STATUS) return badRequest("Only pending long-term rebates can be approved")

  const hasNoOverlap = await ensureNoRebateOverlap({
    studentUserId: rebate.studentUserId,
    periodId: rebate.periodId,
    dateKeys: rebate.dateKeys,
    excludeRebateId: rebate._id,
  })
  if (!hasNoOverlap) return badRequest("This rebate overlaps with another active rebate request")

  rebate.status = APPROVED_STATUS
  rebate.approvedBy = adminUserId
  rebate.approvedAt = new Date()
  rebate.rejectedBy = null
  rebate.rejectedAt = null
  await diningOwner.persistRebate(rebate)

  const populated = await diningQueries.findRebateByIdPopulated(rebate._id, { lean: true })
  return success({ rebate: serializeDiningRebate(populated) }, 200, "Rebate approved successfully")
}

export const rejectDiningRebate = async ({ rebateId, adminUserId, comment = "" }) => {
  if (!mongoose.Types.ObjectId.isValid(rebateId)) return badRequest("Invalid rebate request")

  const rebate = await diningQueries.findRebateById(rebateId)
  if (!rebate) return notFound("Dining rebate")
  if (rebate.status !== PENDING_STATUS) return badRequest("Only pending long-term rebates can be rejected")

  rebate.status = REJECTED_STATUS
  rebate.adminComment = String(comment || "").trim()
  rebate.rejectedBy = adminUserId
  rebate.rejectedAt = new Date()
  await diningOwner.persistRebate(rebate)

  const populated = await diningQueries.findRebateByIdPopulated(rebate._id, { lean: true })
  return success({ rebate: serializeDiningRebate(populated) }, 200, "Rebate rejected successfully")
}

const getPeriodForDay = async (day) => (
  diningQueries.findOnePeriod(
    {
      isArchived: false,
      startDate: { $lte: day },
      endDate: { $gte: day },
    },
    { lean: true },
  )
)

export const getCatererDiningRebateSummary = async ({ catererId }) => {
  if (!mongoose.Types.ObjectId.isValid(catererId)) return badRequest("Valid caterer is required")

  const caterer = await diningQueries.findCatererById(catererId, { lean: true })
  if (!caterer) return notFound("Caterer")

  const today = normalizeDay(new Date())
  const days = [0, 1, 2].map((offset) => addDays(today, offset))
  const summaries = []

  for (const day of days) {
    const dateKey = getDayKey(day)
    const period = await getPeriodForDay(day)

    if (!period) {
      summaries.push({
        date: dateKey,
        period: null,
        allocatedStudentCount: 0,
        approvedRebateCount: 0,
        availableStudentCount: 0,
      })
      continue
    }

    const [allocatedStudentCount, approvedRebateCount] = await Promise.all([
      allocationQueries.countAllocationsByPeriodAndCaterer(period._id, catererId),
      diningQueries.countRebates({
        periodId: period._id,
        catererId,
        status: APPROVED_STATUS,
        dateKeys: dateKey,
      }),
    ])

    summaries.push({
      date: dateKey,
      period: serializePeriod(period),
      allocatedStudentCount,
      approvedRebateCount,
      availableStudentCount: Math.max(allocatedStudentCount - approvedRebateCount, 0),
    })
  }

  return success({
    caterer: serializeCaterer(caterer),
    days: summaries,
    currentRebateCount: summaries[0]?.approvedRebateCount || 0,
    upcomingRebateCount: summaries.slice(1).reduce((sum, day) => sum + Number(day.approvedRebateCount || 0), 0),
  })
}

export const getApprovedRebateStudentIdsForDay = async ({ periodId, catererId, date = new Date() }) => {
  const dateKey = getDayKey(date)
  if (!periodId || !catererId || !dateKey) return new Set()

  const rebates = await diningQueries.findRebates(
    {
      periodId,
      catererId,
      status: APPROVED_STATUS,
      dateKeys: dateKey,
    },
    { select: "studentUserId", lean: true },
  )

  return new Set(rebates.map((rebate) => String(rebate.studentUserId)))
}

export default {
  createStudentDiningRebate,
  getStudentDiningRebates,
  getAdminDiningRebates,
  approveDiningRebate,
  rejectDiningRebate,
  getCatererDiningRebateSummary,
  getApprovedRebateStudentIdsForDay,
}
