/**
 * The Admin / Dining Office rebate board: every rebate seen through one dining
 * period (or the days no period covers), plus office-side create / edit /
 * archive / restore. Rebates stay standalone date ranges (see rebateScope.js);
 * "in a period" just means some of its days fall inside the period's dates.
 *
 * Office edits are not held to the student rules (advance notice, short-term
 * caps, horizon): the office can fix anything. Rule breaks come back as
 * warnings to show before saving. The one hard rule: a student can't have two
 * live (pending / approved, not archived) rebates on the same day.
 */

import crypto from "crypto"
import mongoose from "mongoose"
import { studentProfileQueries } from "../student/studentProfileQueries.service.js"
import { userQueries } from "../user/userQueries.service.js"
import { allocationQueries } from "./allocationQueries.service.js"
import { diningOwner } from "./diningOwner.service.js"
import { diningQueries } from "./diningQueries.service.js"
import { auditService } from "../audit/audit.service.js"
import { badRequest, conflict, notFound, success } from "../base/index.js"
import { attachRebatePlacements, getDayKey, getDiningRebateRules, listDayKeys, normalizeDay, serializeDiningRebate } from "./dining-rebate.service.js"
import { countsRebates, periodKeyRange } from "./rebateScope.js"

const dayWord = (n) => `${n} day${n === 1 ? "" : "s"}`
const OUTSIDE = "outside"
const LIVE_STATUSES = ["approved", "pending"]
const STATUSES = ["approved", "pending", "rejected"]
const TYPES = ["short-term", "long-term"]
const LIST_FILTERS = ["all", ...STATUSES, "archived"]
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100
const MAX_DAYS = 366
const MAX_STUDENTS = 50
const AUDIT = { entityType: "DiningRebate", feature: "dining-rebates" }
const AUDIT_FIELDS = ["startDate", "endDate", "dayCount", "type", "status", "reason", "adminComment"]
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const isId = (value) => mongoose.Types.ObjectId.isValid(String(value || "")) && String(value).length === 24
const text = (value, max = 2000) => String(value ?? "").trim().slice(0, max)

const shortKey = (key) => {
  const day = normalizeDay(key)
  return day ? day.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : key
}
const rangeLabel = (fromKey, toKey) => `${shortKey(fromKey)} – ${shortKey(toKey)}`

// ---------------------------------------------------------------------------
// Periods + scope
// ---------------------------------------------------------------------------

/** Non-archived periods, newest first, with their day-key range and phase. */
const listPeriods = async () => {
  const today = getDayKey(new Date())
  const periods = await diningQueries.findPeriods({ isArchived: false }, { select: "startDate endDate", sort: { startDate: -1 }, lean: true })
  return periods.map((period) => {
    const { fromKey, toKey } = periodKeyRange(period)
    return {
      id: String(period._id),
      startDate: fromKey,
      endDate: toKey,
      days: listDayKeys(fromKey, toKey).length,
      phase: today < fromKey ? "upcoming" : today > toKey ? "past" : "current",
    }
  })
}

/** The running period, else the latest one that has started, else the first upcoming. */
const defaultPeriod = (periods) => (
  periods.find((period) => period.phase === "current")
  || periods.find((period) => period.phase === "past")
  || periods[periods.length - 1]
  || null
)

/** What the board shows: one period, or the days outside every period. */
const resolveScope = (periods, periodId) => {
  const ranges = periods.map((period) => [period.startDate, period.endDate])
  if (String(periodId || "") === OUTSIDE || periods.length === 0) return { kind: OUTSIDE, period: null, ranges }
  const period = periods.find((entry) => entry.id === String(periodId)) || defaultPeriod(periods)
  return { kind: "period", period, fromKey: period.startDate, toKey: period.endDate, ranges }
}

/** `$$k` (a day key) falls inside some period. */
const inAnyRange = (ranges) => ({ $or: ranges.map(([from, to]) => ({ $and: [{ $gte: ["$$k", from] }, { $lte: ["$$k", to] }] })) })

/** Day keys of the rebate that belong to the scope (expression). */
const scopeKeysExpr = (scope) => ({
  $filter: {
    input: "$dateKeys",
    as: "k",
    cond: scope.kind === "period"
      ? { $and: [{ $gte: ["$$k", scope.fromKey] }, { $lte: ["$$k", scope.toKey] }] }
      : scope.ranges.length ? { $not: [inAnyRange(scope.ranges)] } : true,
  },
})

/** Match rebates with at least one day in the scope. */
const scopeMatch = (scope) => {
  if (scope.kind === "period") return { dateKeys: { $elemMatch: { $gte: scope.fromKey, $lte: scope.toKey } } }
  if (!scope.ranges.length) return {}
  return { $expr: { $gt: [{ $size: scopeKeysExpr(scope) }, 0] } }
}

const archivedOrStatus = { $cond: [{ $ifNull: ["$archivedAt", false] }, "archived", "$status"] }

const listFilterMatch = (filter) => {
  if (filter === "archived") return { archivedAt: { $ne: null } }
  if (STATUSES.includes(filter)) return { status: filter, archivedAt: null }
  return { archivedAt: null }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Names for the people who acted on these rebates. */
const actorNames = async (rebates) => {
  const ids = [...new Set(rebates.flatMap((rebate) => [rebate.createdBy, rebate.lastEditedBy, rebate.archivedBy, rebate.approvedBy, rebate.rejectedBy])
    .filter(Boolean).map(String))]
  if (!ids.length) return new Map()
  const users = await userQueries.findUsers({ _id: { $in: ids } }, { select: "name role", lean: true })
  return new Map(users.map((user) => [String(user._id), { id: String(user._id), name: user.name || "", role: user.role || "" }]))
}

const serializeBoardRebates = async (raw) => {
  const [placed, names] = await Promise.all([attachRebatePlacements(raw), actorNames(raw)])
  const who = (id) => (id ? names.get(String(id)) || { id: String(id), name: "", role: "" } : null)
  return placed.map((rebate) => ({
    ...serializeDiningRebate(rebate),
    source: rebate.createdBy ? "office" : "student",
    people: {
      createdBy: who(rebate.createdBy),
      lastEditedBy: who(rebate.lastEditedBy),
      archivedBy: who(rebate.archivedBy),
      approvedBy: who(rebate.approvedBy),
      rejectedBy: who(rebate.rejectedBy),
    },
  }))
}

const loadBoardRebate = async (id) => {
  const [rebate] = await diningQueries.findRebatesPopulated({ _id: id }, { lean: true, includeArchived: true })
  if (!rebate) return null
  const [serialized] = await serializeBoardRebates([rebate])
  return serialized
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The period picker, the selected period's numbers and its day-by-day "away"
 * counts. query: { periodId } ("outside" = days in no period).
 */
export const getRebateBoardOverview = async ({ query = {} } = {}) => {
  const periods = await listPeriods()
  const scope = resolveScope(periods, query.periodId)
  const days = { $size: scopeKeysExpr(scope) }
  const live = { archivedAt: null, status: { $in: LIVE_STATUSES } }

  const facets = {
    byStatus: [{ $group: { _id: archivedOrStatus, count: { $sum: 1 }, days: { $sum: days } } }],
    live: [
      { $match: live },
      {
        $group: {
          _id: null,
          students: { $addToSet: "$studentUserId" },
          longTerm: { $sum: { $cond: [{ $eq: ["$type", "long-term"] }, 1, 0] } },
          office: { $sum: { $cond: [{ $ifNull: ["$createdBy", false] }, 1, 0] } },
          crossing: scope.kind === "period"
            ? { $sum: { $cond: [{ $or: [{ $lt: [{ $min: "$dateKeys" }, scope.fromKey] }, { $gt: [{ $max: "$dateKeys" }, scope.toKey] }] }, 1, 0] } }
            : { $sum: 0 },
        },
      },
      { $project: { _id: 0, students: { $size: "$students" }, longTerm: 1, office: 1, crossing: 1 } },
    ],
  }
  if (scope.kind === "period") {
    facets.daily = [
      { $match: live },
      { $project: { status: 1, dateKeys: 1 } },
      { $unwind: "$dateKeys" },
      { $match: { dateKeys: { $gte: scope.fromKey, $lte: scope.toKey } } },
      { $group: { _id: { day: "$dateKeys", status: "$status" }, count: { $sum: 1 } } },
    ]
  }

  const [result] = await diningQueries.aggregateRebatesIncludingArchived([{ $match: scopeMatch(scope) }, { $facet: facets }])
  const byStatus = Object.fromEntries((result?.byStatus || []).map((row) => [row._id, row]))
  const liveRow = result?.live?.[0] || { students: 0, longTerm: 0, office: 0, crossing: 0 }

  let daily = []
  if (scope.kind === "period") {
    const counts = new Map()
    for (const row of result?.daily || []) {
      const entry = counts.get(row._id.day) || { approved: 0, pending: 0 }
      entry[row._id.status] = row.count
      counts.set(row._id.day, entry)
    }
    daily = listDayKeys(scope.fromKey, scope.toKey).map((date) => ({ date, approved: 0, pending: 0, ...counts.get(date) }))
  }

  const count = (key) => byStatus[key]?.count || 0
  return success({
    periods,
    scope: scope.kind,
    period: scope.period,
    today: getDayKey(new Date()),
    stats: {
      total: count("approved") + count("pending") + count("rejected"),
      approved: count("approved"),
      pending: count("pending"),
      rejected: count("rejected"),
      archived: count("archived"),
      approvedDays: byStatus.approved?.days || 0,
      pendingDays: byStatus.pending?.days || 0,
      students: liveRow.students,
      longTerm: liveRow.longTerm,
      office: liveRow.office,
      crossing: liveRow.crossing,
    },
    daily,
  })
}

/**
 * One page of rebates in the scope.
 * query: { periodId, status (all|approved|pending|rejected|archived), type, search, day, sort (start|newest), page, limit }
 */
export const getRebateBoardList = async ({ query = {} } = {}) => {
  const periods = await listPeriods()
  const scope = resolveScope(periods, query.periodId)
  const filter = LIST_FILTERS.includes(query.status) ? query.status : "all"
  const type = TYPES.includes(query.type) ? query.type : ""
  const search = text(query.search, 60)
  const day = KEY_RE.test(String(query.day || "")) ? String(query.day) : ""
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT))
  const page = Math.max(1, parseInt(query.page, 10) || 1)
  const sort = query.sort === "newest" ? { createdAt: -1, _id: -1 } : { startDate: 1, createdAt: 1, _id: 1 }

  const clauses = [scopeMatch(scope)]
  if (type) clauses.push({ type })
  if (day) clauses.push({ dateKeys: day })
  const pipeline = [{ $match: { $and: clauses } }]
  if (search) {
    const pattern = escapeRegex(search)
    pipeline.push(
      { $lookup: { from: "users", localField: "studentUserId", foreignField: "_id", as: "studentUser", pipeline: [{ $project: { name: 1 } }] } },
      { $match: { $or: [{ rollNumber: { $regex: pattern, $options: "i" } }, { "studentUser.name": { $regex: pattern, $options: "i" } }] } },
    )
  }
  pipeline.push({
    $facet: {
      counts: [{ $group: { _id: archivedOrStatus, count: { $sum: 1 } } }],
      total: [{ $match: listFilterMatch(filter) }, { $count: "n" }],
      entries: [{ $match: listFilterMatch(filter) }, { $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: { _id: 1 } }],
    },
  })

  const [result] = await diningQueries.aggregateRebatesIncludingArchived(pipeline)
  const ids = (result?.entries || []).map((entry) => entry._id)
  const raw = ids.length ? await diningQueries.findRebatesPopulated({ _id: { $in: ids } }, { lean: true, includeArchived: true }) : []
  const order = new Map(ids.map((id, index) => [String(id), index]))
  raw.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)))

  const counts = Object.fromEntries((result?.counts || []).map((row) => [row._id, row.count]))
  return success({
    scope: scope.kind,
    period: scope.period,
    items: await serializeBoardRebates(raw),
    total: result?.total?.[0]?.n || 0,
    page,
    limit,
    counts: {
      all: (counts.approved || 0) + (counts.pending || 0) + (counts.rejected || 0),
      approved: counts.approved || 0,
      pending: counts.pending || 0,
      rejected: counts.rejected || 0,
      archived: counts.archived || 0,
    },
  })
}

export const getRebateBoardItem = async ({ rebateId }) => {
  if (!isId(rebateId)) return badRequest("Invalid rebate")
  const rebate = await loadBoardRebate(rebateId)
  return rebate ? success({ rebate }) : notFound("Dining rebate")
}

/** The rebate's change history (office edits, decisions, archive / restore). */
export const getRebateBoardHistory = async ({ rebateId }) => {
  if (!isId(rebateId)) return badRequest("Invalid rebate")
  return auditService.getEntityHistory({ entityType: AUDIT.entityType, entityId: rebateId, limit: 100 })
}

/**
 * Students for the New rebate picker, by roll number or name (up to 10), with
 * what helps confirm the right person: photo, hostel/room, caterer in the
 * period, and their live rebates from 60 days ago on.
 */
export const searchRebateStudents = async ({ query = {} } = {}) => {
  const search = text(query.search, 60)
  if (search.length < 2) return success({ items: [] })
  const pattern = new RegExp(escapeRegex(search), "i")

  const users = await userQueries.findUsers({ role: "Student", name: pattern }, { select: "_id", lean: true, limit: 25 })
  const profiles = await studentProfileQueries.aggregateProfiles([
    { $match: { $or: [{ rollNumber: pattern }, { userId: { $in: users.map((user) => user._id) } }] } },
    { $addFields: { rank: { $cond: [{ $eq: [{ $toUpper: "$rollNumber" }, search.toUpperCase()] }, 0, { $cond: [{ $eq: ["$status", "Active"] }, 1, 2] }] } } },
    { $sort: { rank: 1, rollNumber: 1 } },
    { $limit: 10 },
    { $project: { userId: 1, rollNumber: 1, status: 1 } },
  ])
  if (!profiles.length) return success({ items: [] })

  const userIds = profiles.map((profile) => profile.userId)
  const periods = await listPeriods()
  const period = periods.find((entry) => entry.id === String(query.periodId)) || defaultPeriod(periods)
  const since = getDayKey(new Date(Date.now() - 60 * 86400000))
  const [details, allocations, rebates] = await Promise.all([
    studentProfileQueries.findDiningStudentDetailsByUserIds(userIds),
    period ? allocationQueries.findAllocationsByUsersAndPeriods(userIds, [period.id]) : [],
    diningQueries.findRebates(
      { studentUserId: { $in: userIds }, status: { $in: LIVE_STATUSES }, endDate: { $gte: normalizeDay(since) } },
      { select: "studentUserId startDate endDate dayCount type status", sort: { startDate: 1 }, lean: true },
    ),
  ])
  const detailBy = new Map(details.map((row) => [String(row.userId?._id || row.userId), row]))
  const allocationBy = new Map(allocations.map((row) => [String(row.studentUserId), row]))

  const items = profiles.map((profile) => {
    const id = String(profile.userId)
    const detail = detailBy.get(id)
    const user = detail?.userId && typeof detail.userId === "object" ? detail.userId : {}
    const room = detail?.currentRoomAllocation
    const allocation = allocationBy.get(id)
    return {
      userId: id,
      rollNumber: profile.rollNumber,
      status: profile.status || "",
      name: user.name || "",
      email: user.email || "",
      profileImage: user.profileImage || "",
      department: detail?.department || "",
      degree: detail?.degree || "",
      hostel: room?.hostelId?.name || "",
      room: [room?.roomId?.unitId?.unitNumber, room?.roomId?.roomNumber].filter(Boolean).join("-"),
      allocation: period
        ? { periodId: period.id, caterer: allocation?.catererId?.name || "", allocated: Boolean(allocation), unregistered: Boolean(allocation?.unregistered) }
        : null,
      rebates: rebates
        .filter((rebate) => String(rebate.studentUserId) === id)
        .map((rebate) => ({ id: String(rebate._id), startDate: getDayKey(rebate.startDate), endDate: getDayKey(rebate.endDate), dayCount: rebate.dayCount, type: rebate.type, status: rebate.status })),
    }
  })
  return success({ items })
}

// ---------------------------------------------------------------------------
// Planning (shared by preview / create / edit / restore)
// ---------------------------------------------------------------------------

/**
 * What a rebate of [startDate, endDate] would mean for each student: where its
 * days land, live rebates it collides with (blocking), and rule warnings
 * (not blocking for the office). Returns { response } on bad input.
 */
const planRebate = async ({ studentUserIds, startDate, endDate, type, excludeRebateId = null }) => {
  const ids = [...new Set((studentUserIds || []).map(String))]
  if (!ids.length) return { response: badRequest("Pick at least one student") }
  if (ids.length > MAX_STUDENTS) return { response: badRequest(`At most ${MAX_STUDENTS} students at a time`) }
  if (!ids.every(isId)) return { response: badRequest("Invalid student") }

  const start = startDate ? normalizeDay(startDate) : null
  const end = endDate ? normalizeDay(endDate) : null
  if (!start || !end) return { response: badRequest("Valid start and end dates are required") }
  if (start > end) return { response: badRequest("The start date must be on or before the end date") }
  const keys = listDayKeys(start, end)
  if (keys.length > MAX_DAYS) return { response: badRequest(`A rebate can be at most ${MAX_DAYS} days long`) }
  const fromKey = keys[0]
  const toKey = keys[keys.length - 1]

  const rules = await getDiningRebateRules()
  const autoType = keys.length > rules.shortTermMaxContinuousDays ? "long-term" : "short-term"
  const finalType = TYPES.includes(type) ? type : autoType

  const periods = (await diningQueries.findPeriods(
    { isArchived: false, startDate: { $lte: normalizeDay(toKey) }, endDate: { $gte: normalizeDay(fromKey) } },
    { select: "startDate endDate", sort: { startDate: 1 }, lean: true },
  )).map((period) => ({ id: String(period._id), ...periodKeyRange(period) }))

  const exclude = excludeRebateId ? { _id: { $ne: excludeRebateId } } : {}
  const [profiles, allocations, overlaps, shortTerm] = await Promise.all([
    studentProfileQueries.findByUserIds(ids, { select: "_id userId rollNumber status", lean: true }),
    periods.length ? allocationQueries.findAllocationsByUsersAndPeriods(ids, periods.map((period) => period.id)) : [],
    diningQueries.findRebates(
      { studentUserId: { $in: ids }, status: { $in: LIVE_STATUSES }, dateKeys: { $in: keys }, ...exclude },
      { select: "studentUserId startDate endDate type status", lean: true },
    ),
    finalType === "short-term" && periods.length
      ? diningQueries.findRebates(
        { studentUserId: { $in: ids }, type: "short-term", status: "approved", dateKeys: { $elemMatch: { $gte: periods[0].fromKey, $lte: periods[periods.length - 1].toKey } }, ...exclude },
        { select: "studentUserId dateKeys", lean: true },
      )
      : [],
  ])
  const profileBy = new Map(profiles.map((profile) => [String(profile.userId), profile]))
  const allocationBy = new Map(allocations.map((row) => [`${row.studentUserId}:${row.periodId}`, row]))

  const students = ids.map((id) => {
    const profile = profileBy.get(id)
    if (!profile) return { studentUserId: id, rollNumber: "", missing: true, conflicts: [], placements: [], unplacedDayCount: 0, warnings: [] }
    const warnings = []
    if (profile.status !== "Active") warnings.push(`${profile.rollNumber} is not an active student`)

    const placed = new Set()
    const placements = periods.map((period) => {
      const inside = keys.filter((key) => key >= period.fromKey && key <= period.toKey)
      if (!inside.length) return null
      inside.forEach((key) => placed.add(key))
      const allocation = allocationBy.get(`${id}:${period.id}`)
      const label = rangeLabel(period.fromKey, period.toKey)
      if (!allocation) warnings.push(`${dayWord(inside.length)} ${inside.length === 1 ? "falls" : "fall"} in ${label}, where the student has no caterer yet: they count once allocated`)
      else if (!countsRebates(allocation)) warnings.push(`${dayWord(inside.length)} ${inside.length === 1 ? "falls" : "fall"} in ${label}, where the student was auto-allocated: they won't count until that is cleared`)
      if (finalType === "short-term") {
        const used = new Set(shortTerm.filter((rebate) => String(rebate.studentUserId) === id)
          .flatMap((rebate) => rebate.dateKeys.filter((key) => key >= period.fromKey && key <= period.toKey)))
        if (used.size + inside.length > rules.shortTermMaxTotalDays) {
          warnings.push(`Short-term days in ${label} would be ${used.size + inside.length}, over the limit of ${rules.shortTermMaxTotalDays}`)
        }
      }
      return {
        periodId: period.id,
        period: { id: period.id, startDate: period.fromKey, endDate: period.toKey },
        caterer: allocation?.catererId?.name ? { name: allocation.catererId.name } : null,
        allocated: Boolean(allocation),
        counted: Boolean(allocation) && countsRebates(allocation),
        dayCount: inside.length,
      }
    }).filter(Boolean)
    const unplacedDayCount = keys.length - placed.size
    if (unplacedDayCount) warnings.push(`${dayWord(unplacedDayCount)} ${unplacedDayCount === 1 ? "is" : "are"} in no dining period yet`)

    const conflicts = overlaps
      .filter((rebate) => String(rebate.studentUserId) === id)
      .map((rebate) => ({ id: String(rebate._id), startDate: getDayKey(rebate.startDate), endDate: getDayKey(rebate.endDate), type: rebate.type, status: rebate.status }))
    return { studentUserId: id, profileId: String(profile._id), rollNumber: profile.rollNumber, conflicts, placements, unplacedDayCount, warnings }
  })

  const notes = []
  if (finalType !== autoType) {
    notes.push(finalType === "long-term"
      ? `By the rules, ${dayWord(keys.length)} is short-term (up to ${rules.shortTermMaxContinuousDays} continuous days)`
      : `By the rules, ${dayWord(keys.length)} is long-term (over ${rules.shortTermMaxContinuousDays} continuous days)`)
  }

  return {
    plan: {
      startDate: fromKey,
      endDate: toKey,
      dateKeys: keys,
      dayCount: keys.length,
      autoType,
      type: finalType,
      notes,
      students,
      blocked: students.some((student) => student.missing || student.conflicts.length > 0),
    },
    start,
    end,
  }
}

const publicPlan = ({ dateKeys, ...plan }) => plan

const conflictMessage = (plan) => {
  const missing = plan.students.filter((student) => student.missing)
  if (missing.length) return "Some students weren't found"
  const clashing = plan.students.filter((student) => student.conflicts.length)
  return clashing.length === 1
    ? `${clashing[0].rollNumber} already has a rebate on some of these days`
    : `${clashing.length} students already have a rebate on some of these days`
}

/** Dry run for create / edit: { studentUserIds | rebateId, startDate, endDate, type } → the plan. */
export const previewBoardRebate = async ({ payload = {} } = {}) => {
  let studentUserIds = payload.studentUserIds
  let excludeRebateId = null
  if (payload.rebateId) {
    if (!isId(payload.rebateId)) return badRequest("Invalid rebate")
    const rebate = await diningQueries.findRebateById(payload.rebateId, { select: "studentUserId", lean: true })
    if (!rebate) return notFound("Dining rebate")
    studentUserIds = [rebate.studentUserId]
    excludeRebateId = rebate._id
  }
  const result = await planRebate({ studentUserIds, startDate: payload.startDate, endDate: payload.endDate, type: payload.type, excludeRebateId })
  return result.response || success({ plan: publicPlan(result.plan) })
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Create the same rebate for one or more students (one row each, one shared
 * requestGroupId). payload: { studentUserIds, startDate, endDate, type, status (approved|pending), reason, adminComment }
 */
export const createBoardRebates = async ({ payload = {}, user }) => {
  const status = LIVE_STATUSES.includes(payload.status) ? payload.status : "approved"
  const result = await planRebate({ studentUserIds: payload.studentUserIds, startDate: payload.startDate, endDate: payload.endDate, type: payload.type })
  if (result.response) return result.response
  const { plan, start, end } = result
  if (plan.blocked) return conflict(conflictMessage(plan))

  const now = new Date()
  const requestGroupId = crypto.randomUUID()
  const created = await diningOwner.insertRebates(plan.students.map((student) => ({
    requestGroupId,
    periodId: null,
    catererId: null,
    studentUserId: student.studentUserId,
    studentProfileId: student.profileId,
    rollNumber: student.rollNumber,
    startDate: start,
    endDate: end,
    dateKeys: plan.dateKeys,
    dayCount: plan.dayCount,
    type: plan.type,
    status,
    reason: text(payload.reason),
    adminComment: text(payload.adminComment),
    approvedBy: status === "approved" ? user._id : null,
    approvedAt: status === "approved" ? now : null,
    createdBy: user._id,
  })))

  await Promise.all(created.map((doc) => auditService.recordCreate({
    ...AUDIT,
    entityId: doc._id,
    snapshot: pickAudit(doc),
    actor: user,
    reason: text(payload.note, 500) || null,
  })))

  const raw = await diningQueries.findRebatesPopulated({ _id: { $in: created.map((doc) => doc._id) } }, { lean: true })
  const rebates = await serializeBoardRebates(raw)
  return success({ rebates }, 201, created.length === 1 ? "Rebate created" : `Rebate created for ${created.length} students`)
}

const pickAudit = (doc) => ({
  startDate: getDayKey(doc.startDate),
  endDate: getDayKey(doc.endDate),
  dayCount: doc.dayCount,
  type: doc.type,
  status: doc.status,
  reason: doc.reason || "",
  adminComment: doc.adminComment || "",
})

/**
 * Office edit of anything but the student: dates, type, status, message, comment.
 * payload: { startDate, endDate, type, status, reason, adminComment, note }
 */
export const updateBoardRebate = async ({ rebateId, payload = {}, user }) => {
  if (!isId(rebateId)) return badRequest("Invalid rebate")
  const rebate = await diningQueries.findRebateById(rebateId)
  if (!rebate) return notFound("Dining rebate")
  if (rebate.archivedAt) return badRequest("Restore this rebate before editing it")

  const status = payload.status === undefined ? rebate.status : payload.status
  if (!STATUSES.includes(status)) return badRequest("Status must be approved, pending or rejected")
  const type = payload.type === undefined ? rebate.type : payload.type
  if (!TYPES.includes(type)) return badRequest("Type must be short-term or long-term")

  const result = await planRebate({
    studentUserIds: [rebate.studentUserId],
    startDate: payload.startDate ?? rebate.startDate,
    endDate: payload.endDate ?? rebate.endDate,
    type,
    excludeRebateId: rebate._id,
  })
  if (result.response) return result.response
  const { plan, start, end } = result
  // A rejected rebate blocks nothing, so it may overlap.
  if (status !== "rejected" && plan.students[0].conflicts.length) return conflict(conflictMessage(plan))

  const before = pickAudit(rebate)
  const now = new Date()
  if (status !== rebate.status) {
    rebate.approvedBy = status === "approved" ? user._id : null
    rebate.approvedAt = status === "approved" ? now : null
    rebate.rejectedBy = status === "rejected" ? user._id : null
    rebate.rejectedAt = status === "rejected" ? now : null
  }
  rebate.status = status
  rebate.type = type
  rebate.startDate = start
  rebate.endDate = end
  rebate.dateKeys = plan.dateKeys
  rebate.dayCount = plan.dayCount
  if (payload.reason !== undefined) rebate.reason = text(payload.reason)
  if (payload.adminComment !== undefined) rebate.adminComment = text(payload.adminComment)

  const after = pickAudit(rebate)
  if (AUDIT_FIELDS.every((field) => String(before[field]) === String(after[field]))) {
    return success({ rebate: await loadBoardRebate(rebate._id) }, 200, "Nothing changed")
  }
  rebate.lastEditedBy = user._id
  rebate.lastEditedAt = now
  await diningOwner.persistRebate(rebate)
  await auditService.recordUpdate({ ...AUDIT, entityId: rebate._id, before, after, fields: AUDIT_FIELDS, actor: user, reason: text(payload.note, 500) || null })

  return success({ rebate: await loadBoardRebate(rebate._id) }, 200, "Rebate updated")
}

/** Archive (delete but keep): it stops counting everywhere. payload: { reason } */
export const archiveBoardRebate = async ({ rebateId, payload = {}, user }) => {
  if (!isId(rebateId)) return badRequest("Invalid rebate")
  const rebate = await diningQueries.findRebateById(rebateId)
  if (!rebate) return notFound("Dining rebate")
  if (rebate.archivedAt) return badRequest("This rebate is already archived")

  rebate.archivedAt = new Date()
  rebate.archivedBy = user._id
  rebate.archiveReason = text(payload.reason, 500)
  await diningOwner.persistRebate(rebate)
  await auditService.recordDelete({ ...AUDIT, entityId: rebate._id, snapshot: pickAudit(rebate), actor: user, reason: rebate.archiveReason || null })

  return success({ rebate: await loadBoardRebate(rebate._id) }, 200, "Rebate archived")
}

/** Bring an archived rebate back, unless a live rebate now holds some of its days. */
export const restoreBoardRebate = async ({ rebateId, user }) => {
  if (!isId(rebateId)) return badRequest("Invalid rebate")
  const rebate = await diningQueries.findRebateById(rebateId)
  if (!rebate) return notFound("Dining rebate")
  if (!rebate.archivedAt) return badRequest("This rebate isn't archived")

  if (LIVE_STATUSES.includes(rebate.status)) {
    const clash = await diningQueries.findOneRebate(
      { _id: { $ne: rebate._id }, studentUserId: rebate.studentUserId, status: { $in: LIVE_STATUSES }, dateKeys: { $in: rebate.dateKeys } },
      { select: "startDate endDate", lean: true },
    )
    if (clash) {
      return conflict(`Another rebate (${rangeLabel(getDayKey(clash.startDate), getDayKey(clash.endDate))}) now covers some of these days. Edit or archive it first.`)
    }
  }

  rebate.archivedAt = null
  rebate.archivedBy = null
  rebate.archiveReason = ""
  await diningOwner.persistRebate(rebate)
  await auditService.recordRestore({ ...AUDIT, entityId: rebate._id, snapshot: pickAudit(rebate), actor: user })

  return success({ rebate: await loadBoardRebate(rebate._id) }, 200, "Rebate restored")
}

export default {
  getRebateBoardOverview,
  getRebateBoardList,
  getRebateBoardItem,
  getRebateBoardHistory,
  searchRebateStudents,
  previewBoardRebate,
  createBoardRebates,
  updateBoardRebate,
  archiveBoardRebate,
  restoreBoardRebate,
}
