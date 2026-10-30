import crypto from "crypto"
import mongoose from "mongoose"
import { studentProfileQueries } from "../student/studentProfileQueries.service.js"
import { allocationQueries } from "./allocationQueries.service.js"
import { diningOwner } from "./diningOwner.service.js"
import { diningQueries } from "./diningQueries.service.js"
import { configQueries } from "../config/configQueries.service.js"
import { fileAccessService } from "../storage/file-access.service.js"
import { isMediaRef } from "../storage/file-ref.service.js"
import { badRequest, notFound, success } from "../base/index.js"
import { keysInRange, periodKeyRange, rebateScopeFilter } from "./rebateScope.js"
import { DINING_REBATE_CONFIG_KEY, REBATE_MAX_ADVANCE_MONTHS, resolveRebateRules } from "./rebateRules.js"

const APPROVED_STATUS = "approved"
const PENDING_STATUS = "pending"
const REJECTED_STATUS = "rejected"
const SHORT_TERM_TYPE = "short-term"
const LONG_TERM_TYPE = "long-term"

const DAY_MS = 24 * 60 * 60 * 1000

// Storage policy KEY (not the upload policy name) recorded in file metadata.
const REBATE_FORM_STORAGE_POLICY = "dining-rebate-forms"
const FORM_REQUIRED_MESSAGE = "Please upload the filled long-term rebate form"
const INVALID_FORM_MESSAGE = "The rebate form must be a file you uploaded for this rebate request"

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

const addMonthsClamped = (value, months) => {
  const day = normalizeDay(value)
  const targetMonth = day.getUTCMonth() + months
  const lastDayOfTarget = new Date(Date.UTC(day.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(day.getUTCFullYear(), targetMonth, Math.min(day.getUTCDate(), lastDayOfTarget)))
}

/** The global rebate rules: config `diningRebate` merged over the defaults. */
export const getDiningRebateRules = async () => {
  const config = await configQueries.findByKeyLean(DINING_REBATE_CONFIG_KEY)
  return resolveRebateRules(config?.value)
}

/** Rules as the student portal shows them (adds the advance horizon). */
const serializeRules = (rules) => ({ ...rules, maxAdvanceMonths: REBATE_MAX_ADVANCE_MONTHS })

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
  }
}

const serializeRebateForm = (form = null) => {
  if (!form?.ref) return null
  return {
    ref: form.ref,
    name: form.name || "",
    uploadedAt: form.uploadedAt || null,
  }
}

/**
 * One rebate for API responses. `periodId`/`period`/`catererId`/`caterer` are
 * LEGACY (null on rebates created since rebates became standalone). Where a
 * rebate counts lives in `placements` + `unplacedDayCount`, which are filled
 * when the raw rebate went through `attachRebatePlacements` first; otherwise
 * both are null (not computed).
 */
export const serializeDiningRebate = (rebate = {}) => ({
  id: rebate._id || rebate.id,
  requestGroupId: rebate.requestGroupId,
  periodId: rebate.periodId?._id || rebate.periodId || null,
  period: serializePeriod(rebate.periodId && typeof rebate.periodId === "object" && rebate.periodId.startDate ? rebate.periodId : null),
  catererId: rebate.catererId?._id || rebate.catererId || null,
  caterer: serializeCaterer(rebate.catererId && typeof rebate.catererId === "object" && rebate.catererId.name ? rebate.catererId : null),
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
  form: serializeRebateForm(rebate.form),
  placements: Array.isArray(rebate.placements) ? rebate.placements : null,
  unplacedDayCount: Number.isFinite(rebate.unplacedDayCount) ? rebate.unplacedDayCount : null,
  approvedAt: rebate.approvedAt,
  rejectedAt: rebate.rejectedAt,
  createdAt: rebate.createdAt,
  updatedAt: rebate.updatedAt,
})

const getStudentProfileForUser = async (userId) => (
  studentProfileQueries.findByUserId(userId, { select: "_id userId rollNumber status", lean: true })
)

/** Non-archived periods overlapping [fromKey, toKey], oldest first. */
const getPeriodsForKeyRange = async (fromKey, toKey) => (
  diningQueries.findPeriods(
    {
      isArchived: false,
      startDate: { $lte: normalizeDay(toKey) },
      endDate: { $gte: normalizeDay(fromKey) },
    },
    { select: "startDate endDate", sort: { startDate: 1 }, lean: true },
  )
)

const studentIdOf = (rebate) => String(rebate.studentUserId?._id || rebate.studentUserId)

/**
 * Split each rebate over the existing (non-archived) periods it overlaps, with
 * the student's caterer in each. Batched: one periods read + one allocations
 * read for the whole list. Returns new objects with `placements` and
 * `unplacedDayCount` (raw docs otherwise unchanged, ready for serializeDiningRebate).
 */
export const attachRebatePlacements = async (rebates = []) => {
  const list = (Array.isArray(rebates) ? rebates : []).filter(Boolean)
  const allKeys = list.flatMap((rebate) => (Array.isArray(rebate.dateKeys) ? rebate.dateKeys : []))
  if (allKeys.length === 0) {
    return list.map((rebate) => ({ ...rebate, placements: [], unplacedDayCount: Number(rebate.dayCount || 0) }))
  }

  const fromKey = allKeys.reduce((min, key) => (key < min ? key : min))
  const toKey = allKeys.reduce((max, key) => (key > max ? key : max))
  const periods = await getPeriodsForKeyRange(fromKey, toKey)
  const ranges = periods.map((period) => ({ period, ...periodKeyRange(period) }))

  const studentIds = [...new Set(list.map(studentIdOf))]
  const allocations = await allocationQueries.findAllocationsByUsersAndPeriods(studentIds, periods.map((period) => period._id))
  const catererByStudentPeriod = new Map(allocations.map((allocation) => [
    `${allocation.studentUserId}:${allocation.periodId}`,
    allocation.catererId && typeof allocation.catererId === "object"
      ? { id: allocation.catererId._id, name: allocation.catererId.name }
      : null,
  ]))

  return list.map((rebate) => {
    const dateKeys = Array.isArray(rebate.dateKeys) ? rebate.dateKeys : []
    const placed = new Set()
    const placements = []
    for (const { period, fromKey: pFrom, toKey: pTo } of ranges) {
      const keys = keysInRange(rebate, pFrom, pTo)
      if (keys.length === 0) continue
      keys.forEach((key) => placed.add(key))
      placements.push({
        periodId: period._id,
        period: serializePeriod(period),
        caterer: catererByStudentPeriod.get(`${studentIdOf(rebate)}:${period._id}`) || null,
        dayCount: keys.length,
        dateKeys: keys,
      })
    }
    return { ...rebate, placements, unplacedDayCount: dateKeys.filter((key) => !placed.has(key)).length }
  })
}

const serializeWithPlacements = async (rebates = []) => (
  (await attachRebatePlacements(rebates)).map((rebate) => serializeDiningRebate(rebate))
)

/** Does any of the student's pending/approved rebates share a day with dateKeys? */
const hasRebateOverlap = async ({ studentUserId, dateKeys, excludeRebateId = null }) => {
  const query = {
    studentUserId,
    dateKeys: { $in: dateKeys },
    status: { $in: [APPROVED_STATUS, PENDING_STATUS] },
  }
  if (excludeRebateId) query._id = { $ne: excludeRebateId }

  const overlap = await diningQueries.findOneRebate(query, { select: "_id", lean: true })
  return Boolean(overlap)
}

/** The student's approved short-term day keys between fromKey and toKey (deduped). */
const getApprovedShortTermKeys = async ({ studentUserId, fromKey, toKey }) => {
  const rebates = await diningQueries.findRebates(
    {
      studentUserId,
      type: SHORT_TERM_TYPE,
      status: APPROVED_STATUS,
      dateKeys: { $elemMatch: { $gte: fromKey, $lte: toKey } },
    },
    { select: "dateKeys", lean: true },
  )
  const keys = new Set()
  rebates.forEach((rebate) => keysInRange(rebate, fromKey, toKey).forEach((key) => keys.add(key)))
  return [...keys]
}

const formatKey = (key) => {
  const day = normalizeDay(key)
  return day ? day.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : key
}

/**
 * Validate a student's rebate request against the global rules. Rebates are
 * standalone: no dining period or allocation is required.
 *  - short/long is decided on the whole request (its continuous day count);
 *  - short-term: min days, min advance, and per EXISTING period overlapped the
 *    student's approved short-term days inside it + this request's days there
 *    must stay within shortTermMaxTotalDays (days in no period are not capped);
 *  - the last day may be at most today + 6 months;
 *  - no overlap with the student's own pending/approved rebates.
 * Returns { response } on failure, else { rebate, placements, unplacedDayCount, rules }.
 */
const buildValidatedRebate = async ({ userId, startDate, endDate, reason = "" }) => {
  const profile = await getStudentProfileForUser(userId)
  if (!profile) return { response: notFound("Student profile") }
  if (profile.status !== "Active") return { response: badRequest("Only active students can request dining rebates") }

  const startDay = startDate ? normalizeDay(startDate) : null
  const endDay = endDate ? normalizeDay(endDate) : null
  if (!startDay || !endDay) return { response: badRequest("Valid rebate start and end dates are required") }
  if (startDay > endDay) return { response: badRequest("Rebate start date must be before or equal to end date") }

  const requestedKeys = listDayKeys(startDay, endDay)
  if (requestedKeys.length === 0) return { response: badRequest("Please select at least one rebate day") }

  const nowDay = normalizeDay(new Date())
  const latestAllowedDay = addMonthsClamped(nowDay, REBATE_MAX_ADVANCE_MONTHS)
  if (endDay > latestAllowedDay) {
    return { response: badRequest(`Rebates can be requested at most ${REBATE_MAX_ADVANCE_MONTHS} months ahead (until ${formatKey(getDayKey(latestAllowedDay))})`) }
  }

  const rules = await getDiningRebateRules()
  const dayCount = requestedKeys.length
  const isLongTerm = dayCount > rules.shortTermMaxContinuousDays
  const type = isLongTerm ? LONG_TERM_TYPE : SHORT_TERM_TYPE
  const status = isLongTerm ? PENDING_STATUS : APPROVED_STATUS

  if (await hasRebateOverlap({ studentUserId: userId, dateKeys: requestedKeys })) {
    return { response: badRequest("One or more selected days already have a rebate request") }
  }

  if (!isLongTerm) {
    if (dayCount < rules.shortTermMinApplicationDays) {
      return { response: badRequest(`Short-term rebate must be at least ${rules.shortTermMinApplicationDays} day(s)`) }
    }
    if (startDay < addDays(nowDay, rules.shortTermMinAdvanceDays)) {
      return { response: badRequest(`Short-term rebate must be requested at least ${rules.shortTermMinAdvanceDays} day(s) in advance`) }
    }
  }

  const fromKey = requestedKeys[0]
  const toKey = requestedKeys[requestedKeys.length - 1]
  const periods = await getPeriodsForKeyRange(fromKey, toKey)
  const ranges = periods.map((period) => ({ period, ...periodKeyRange(period) }))

  // One read covering every overlapped period; split per period in memory.
  const usedKeys = ranges.length
    ? await getApprovedShortTermKeys({
      studentUserId: userId,
      fromKey: ranges[0].fromKey,
      toKey: ranges.reduce((max, range) => (range.toKey > max ? range.toKey : max), ranges[0].toKey),
    })
    : []
  const allocations = ranges.length
    ? await allocationQueries.findAllocationsByUsersAndPeriods([userId], periods.map((period) => period._id))
    : []
  const catererByPeriod = new Map(allocations.map((allocation) => [
    String(allocation.periodId),
    allocation.catererId && typeof allocation.catererId === "object"
      ? { id: allocation.catererId._id, name: allocation.catererId.name }
      : null,
  ]))

  const placed = new Set()
  const placements = []
  for (const { period, fromKey: pFrom, toKey: pTo } of ranges) {
    const keys = requestedKeys.filter((key) => key >= pFrom && key <= pTo)
    if (keys.length === 0) continue
    keys.forEach((key) => placed.add(key))
    const usedShortTermDays = usedKeys.filter((key) => key >= pFrom && key <= pTo).length

    if (!isLongTerm && usedShortTermDays + keys.length > rules.shortTermMaxTotalDays) {
      return {
        response: badRequest(
          `Short-term rebate limit exceeded for the dining period ${formatKey(pFrom)} – ${formatKey(pTo)}. `
          + `Available days: ${Math.max(rules.shortTermMaxTotalDays - usedShortTermDays, 0)}`,
        ),
      }
    }

    placements.push({
      periodId: period._id,
      period: serializePeriod(period),
      caterer: catererByPeriod.get(String(period._id)) || null,
      dayCount: keys.length,
      dateKeys: keys,
      usedShortTermDays,
      maxShortTermDays: rules.shortTermMaxTotalDays,
    })
  }

  return {
    rules,
    placements,
    unplacedDayCount: requestedKeys.filter((key) => !placed.has(key)).length,
    rebate: {
      periodId: null,
      catererId: null,
      studentUserId: userId,
      studentProfileId: profile._id,
      rollNumber: profile.rollNumber,
      startDate: startDay,
      endDate: endDay,
      dateKeys: requestedKeys,
      dayCount,
      type,
      status,
      reason: String(reason || "").trim(),
      approvedAt: status === APPROVED_STATUS ? new Date() : null,
    },
  }
}

/** The blank long-term rebate form configured by Admin, or null when none is set. */
export const getLongTermRebateFormTemplate = async () => {
  const config = await configQueries.findByKeyLean(DINING_REBATE_CONFIG_KEY)
  const ref = String(config?.value?.longTermFormRef || "").trim()
  if (!isMediaRef(ref)) return null
  return { ref, name: String(config?.value?.longTermFormName || "").trim() }
}

/**
 * Validate the student's filled form: it must be a media ref this student uploaded
 * under the dining-rebate-forms storage policy. Returns { form } or { response }.
 */
const validateSubmittedRebateForm = async ({ userId, form }) => {
  const ref = String(form?.ref || "").trim()
  if (!isMediaRef(ref)) return { response: badRequest(INVALID_FORM_MESSAGE) }

  let meta
  try {
    meta = await fileAccessService.getMetadata(ref)
  } catch {
    return { response: badRequest(INVALID_FORM_MESSAGE) }
  }

  if (meta?.policy !== REBATE_FORM_STORAGE_POLICY || String(meta?.actorId || "") !== String(userId)) {
    return { response: badRequest(INVALID_FORM_MESSAGE) }
  }

  return {
    form: {
      ref,
      name: String(form?.name || "").trim().slice(0, 200),
      uploadedAt: new Date(),
    },
  }
}

/** Dry run of createStudentDiningRebate: same validation, nothing saved. */
export const previewStudentDiningRebate = async ({ userId, payload = {} }) => {
  const validation = await buildValidatedRebate({
    userId,
    startDate: payload.startDate,
    endDate: payload.endDate,
  })

  if (validation.response) return validation.response

  const { rebate } = validation
  const hasLongTerm = rebate.type === LONG_TERM_TYPE
  const template = hasLongTerm ? await getLongTermRebateFormTemplate() : null

  return success({
    type: rebate.type,
    status: rebate.status,
    dayCount: rebate.dayCount,
    startDate: rebate.startDate,
    endDate: rebate.endDate,
    placements: validation.placements.map(({ dateKeys, ...placement }) => placement),
    unplacedDayCount: validation.unplacedDayCount,
    hasLongTerm,
    formRequired: Boolean(hasLongTerm && template),
  })
}

export const createStudentDiningRebate = async ({ userId, payload = {} }) => {
  const validation = await buildValidatedRebate({
    userId,
    startDate: payload.startDate,
    endDate: payload.endDate,
    reason: payload.reason,
  })

  if (validation.response) return validation.response

  const isLongTerm = validation.rebate.type === LONG_TERM_TYPE

  // Short-term requests ignore `form`. Long-term requests require it when a
  // blank template is configured; a supplied form is always validated.
  let form = null
  if (isLongTerm) {
    const hasForm = Boolean(String(payload.form?.ref || "").trim())
    if (!hasForm) {
      const template = await getLongTermRebateFormTemplate()
      if (template) return badRequest(FORM_REQUIRED_MESSAGE)
    } else {
      const formValidation = await validateSubmittedRebateForm({ userId, form: payload.form })
      if (formValidation.response) return formValidation.response
      form = formValidation.form
    }
  }

  const [created] = await diningOwner.insertRebates([{
    ...validation.rebate,
    form,
    requestGroupId: crypto.randomUUID(),
  }])

  const populated = await diningQueries.findRebateByIdPopulated(created._id, { lean: true })

  return success(
    { rebates: await serializeWithPlacements([populated]) },
    201,
    isLongTerm ? "Long-term rebate request submitted for approval" : "Short-term rebate approved",
  )
}

export const getStudentDiningRebates = async ({ userId }) => {
  const [rebates, longTermForm, rules] = await Promise.all([
    diningQueries.findRebatesPopulated(
      { studentUserId: userId },
      { sort: { startDate: -1, createdAt: -1 }, limit: 100, lean: true },
    ),
    getLongTermRebateFormTemplate(),
    getDiningRebateRules(),
  ])

  return success({
    rebates: await serializeWithPlacements(rebates),
    longTermForm,
    rules: serializeRules(rules),
  })
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

  return success({ rebates: await serializeWithPlacements(rebates) })
}

export const approveDiningRebate = async ({ rebateId, adminUserId }) => {
  if (!mongoose.Types.ObjectId.isValid(rebateId)) return badRequest("Invalid rebate request")

  const rebate = await diningQueries.findRebateById(rebateId)
  if (!rebate) return notFound("Dining rebate")
  if (rebate.status !== PENDING_STATUS) return badRequest("Only pending long-term rebates can be approved")

  const overlaps = await hasRebateOverlap({
    studentUserId: rebate.studentUserId,
    dateKeys: rebate.dateKeys,
    excludeRebateId: rebate._id,
  })
  if (overlaps) return badRequest("This rebate overlaps with another active rebate request")

  rebate.status = APPROVED_STATUS
  rebate.approvedBy = adminUserId
  rebate.approvedAt = new Date()
  rebate.rejectedBy = null
  rebate.rejectedAt = null
  await diningOwner.persistRebate(rebate)

  const populated = await diningQueries.findRebateByIdPopulated(rebate._id, { lean: true })
  const [serialized] = await serializeWithPlacements([populated])
  return success({ rebate: serialized }, 200, "Rebate approved successfully")
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
  const [serialized] = await serializeWithPlacements([populated])
  return success({ rebate: serialized }, 200, "Rebate rejected successfully")
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

/** Approved rebates on one day for the students allocated to a caterer in a period (attribution). */
const countApprovedRebatesForCatererDay = async ({ periodId, catererId, dateKey }) => {
  const studentUserIds = await allocationQueries.findStudentUserIdsByPeriodAndCaterer(periodId, catererId)
  const filter = rebateScopeFilter([{ studentUserIds, fromKey: dateKey, toKey: dateKey }], { status: APPROVED_STATUS })
  if (!filter) return { allocatedStudentCount: 0, approvedRebateCount: 0 }
  return {
    allocatedStudentCount: studentUserIds.length,
    approvedRebateCount: await diningQueries.countRebates(filter),
  }
}

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

    const { allocatedStudentCount, approvedRebateCount } = await countApprovedRebatesForCatererDay({
      periodId: period._id,
      catererId,
      dateKey,
    })

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

/**
 * The studentUserIds (strings) with an approved rebate on `date` among the
 * students allocated to `catererId` in `periodId`. Empty when the day is
 * outside the period's dates.
 */
export const getApprovedRebateStudentIdsForDay = async ({ periodId, catererId, date = new Date() }) => {
  const dateKey = getDayKey(date)
  if (!periodId || !catererId || !dateKey) return new Set()

  const period = await diningQueries.findPeriodById(periodId, { select: "startDate endDate", lean: true })
  if (!period) return new Set()
  const range = periodKeyRange(period)
  if (dateKey < range.fromKey || dateKey > range.toKey) return new Set()

  const studentUserIds = await allocationQueries.findStudentUserIdsByPeriodAndCaterer(periodId, catererId)
  const filter = rebateScopeFilter([{ studentUserIds, fromKey: dateKey, toKey: dateKey }], { status: APPROVED_STATUS })
  if (!filter) return new Set()

  const rebates = await diningQueries.findRebates(filter, { select: "studentUserId", lean: true })
  return new Set(rebates.map((rebate) => String(rebate.studentUserId)))
}

export default {
  createStudentDiningRebate,
  previewStudentDiningRebate,
  getLongTermRebateFormTemplate,
  getDiningRebateRules,
  attachRebatePlacements,
  getStudentDiningRebates,
  getAdminDiningRebates,
  approveDiningRebate,
  rejectDiningRebate,
  getCatererDiningRebateSummary,
  getApprovedRebateStudentIdsForDay,
}
