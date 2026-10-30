/**
 * Dining Tags (Admin + Dining Office)
 * Yes/no student attributes for dining (e.g. "Jain food"). Standalone tags are
 * created and edited here; allocation (period) tags are defined in the dining
 * period form, but both kinds are listed, archived and have their student
 * answers managed here (single edit or CSV bulk).
 *
 * Writes go through services/dining/tagOwner, reads through tagQueries.
 */

import mongoose from "mongoose"
import { success, badRequest, notFound } from "../../../../services/base/index.js"
import { tagOwner } from "../../../../services/dining/tagOwner.service.js"
import { tagQueries } from "../../../../services/dining/tagQueries.service.js"
import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { studentProfileQueries } from "../../../../services/student/studentProfileQueries.service.js"

export const MAX_BULK_ENTRIES = 5000
const MAX_AUDIENCE_ROLLS = 10000
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

const idOf = (value) => String(value?._id || value || "")
const keyOf = (date) => (date ? new Date(date).toISOString().slice(0, 10) : null)
const utcDay = (key) => new Date(`${key}T00:00:00.000Z`)
const normalizeRoll = (value) => String(value ?? "").trim().toUpperCase()
const isObjectId = (value) => typeof value === "string" && mongoose.Types.ObjectId.isValid(value)

/** "YYYY-MM-DD" (or an ISO string starting with one) -> the key, else null. */
const parseDayKey = (value) => {
  const key = typeof value === "string" ? value.trim().slice(0, 10) : value instanceof Date ? keyOf(value) : ""
  if (!DATE_KEY.test(key || "")) return null
  return Number.isNaN(utcDay(key).getTime()) ? null : key
}

const parseInstant = (value) => {
  if (value === null || value === undefined || value === "") return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/** Lenient boolean for CSV-ish input: true/false, yes/no, y/n, 1/0. Returns undefined when unrecognized. */
export const parseTagBoolean = (value) => {
  if (typeof value === "boolean") return value
  if (value === 1 || value === 0) return value === 1
  const text = String(value ?? "").trim().toLowerCase()
  if (["true", "yes", "y", "1"].includes(text)) return true
  if (["false", "no", "n", "0"].includes(text)) return false
  return undefined
}

const isFormOpen = (tag, now = new Date()) => Boolean(
  !tag.isArchived && tag.form?.enabled && tag.form.opensAt && tag.form.closesAt
  && new Date(tag.form.opensAt) <= now && now <= new Date(tag.form.closesAt)
)

const emptyCounts = () => ({ yes: 0, no: 0, answered: 0 })

/** The full Tag shape of this API. `period` = lean DiningPeriod (period tags). */
export const serializeTag = (tag, { period = null, counts = null, now = new Date() } = {}) => {
  const isPeriod = tag.kind === "period"
  return {
    id: idOf(tag),
    kind: tag.kind,
    name: tag.name,
    question: tag.question || "",
    description: tag.description || "",
    periodId: tag.periodId ? idOf(tag.periodId) : null,
    period: isPeriod && period ? { id: idOf(period), startDate: keyOf(period.startDate), endDate: keyOf(period.endDate) } : null,
    startDate: isPeriod ? keyOf(period?.startDate) : keyOf(tag.startDate),
    endDate: isPeriod ? keyOf(period?.endDate) : keyOf(tag.endDate),
    defaultValue: tag.defaultValue ?? null,
    form: {
      enabled: Boolean(tag.form?.enabled),
      opensAt: tag.form?.opensAt || null,
      closesAt: tag.form?.closesAt || null,
      audience: tag.form?.audience || "all-active",
      rollNumbers: tag.form?.rollNumbers || [],
      isOpen: isFormOpen(tag, now),
    },
    isArchived: Boolean(tag.isArchived),
    counts: counts || emptyCounts(),
    createdAt: tag.createdAt || null,
  }
}

/** Serialize many tags with one period read and one counts aggregate. */
const serializeTags = async (tags) => {
  const periodIds = [...new Set(tags.filter((tag) => tag.periodId).map((tag) => idOf(tag.periodId)))]
  const [periods, counts] = await Promise.all([
    periodIds.length ? diningQueries.findPeriods({ _id: { $in: periodIds } }, { select: "startDate endDate isArchived", lean: true }) : [],
    tagQueries.countsByTag(tags.map((tag) => tag._id)),
  ])
  const periodById = new Map(periods.map((period) => [idOf(period), period]))
  const now = new Date()
  return tags.map((tag) => serializeTag(tag, { period: periodById.get(idOf(tag.periodId)) || null, counts: counts.get(idOf(tag)), now }))
}

const serializeOne = async (tag) => (await serializeTags([tag]))[0]

// ---------------------------------------------------------------- tags

export const listTags = async ({ query = {} }) => {
  const filter = { isArchived: query.archived === "true" }
  if (query.kind) {
    if (!["standalone", "period"].includes(query.kind)) return badRequest("kind must be standalone or period")
    filter.kind = query.kind
  }
  if (query.periodId) {
    if (!isObjectId(query.periodId)) return badRequest("Invalid dining period")
    filter.periodId = new mongoose.Types.ObjectId(query.periodId)
  }
  const tags = await tagQueries.findTags(filter, { sort: { kind: 1, startDate: -1, order: 1, createdAt: -1 } })
  return success(await serializeTags(tags))
}

/** Validate a standalone-tag payload. Returns { error } or { data } (fields to persist). */
const validateStandalone = async (body = {}, existing = null) => {
  const name = String(body.name ?? "").trim()
  if (!name) return { error: "Name is required" }
  if (name.length > 60) return { error: "Name must be at most 60 characters" }
  const question = String(body.question ?? "").trim()
  if (question.length > 200) return { error: "Question must be at most 200 characters" }
  const description = String(body.description ?? "").trim()
  if (description.length > 1000) return { error: "Description must be at most 1000 characters" }

  const startKey = parseDayKey(body.startDate)
  const endKey = parseDayKey(body.endDate)
  if (!startKey || !endKey) return { error: "Start date and end date are required (YYYY-MM-DD)" }
  if (startKey > endKey) return { error: "Start date must be on or before end date" }

  const defaultValue = body.defaultValue === undefined ? null : body.defaultValue
  if (defaultValue !== null && typeof defaultValue !== "boolean") return { error: "Default value must be yes, no or none" }

  const rawForm = body.form && typeof body.form === "object" ? body.form : {}
  const enabled = rawForm.enabled === true
  const audience = rawForm.audience === undefined || rawForm.audience === null || rawForm.audience === "" ? "all-active" : rawForm.audience
  if (!["all-active", "custom"].includes(audience)) return { error: "Form audience must be all-active or custom" }
  const rollNumbers = [...new Set((Array.isArray(rawForm.rollNumbers) ? rawForm.rollNumbers : []).map(normalizeRoll).filter(Boolean))]
  if (rollNumbers.length > MAX_AUDIENCE_ROLLS) return { error: `At most ${MAX_AUDIENCE_ROLLS} roll numbers are allowed` }
  const opensAt = parseInstant(rawForm.opensAt)
  const closesAt = parseInstant(rawForm.closesAt)
  if (opensAt === undefined || closesAt === undefined) return { error: "Invalid form open or close time" }
  if (enabled) {
    if (!opensAt || !closesAt) return { error: "Form open and close times are required" }
    if (opensAt >= closesAt) return { error: "Form must open before it closes" }
    if (audience === "custom" && !rollNumbers.length) return { error: "Add at least one roll number for a custom audience" }
  }

  const clashes = await tagQueries.findLiveTagsByName(name, { kind: "standalone" })
  if (clashes.some((tag) => idOf(tag) !== idOf(existing))) return { error: `A tag named "${name}" already exists` }

  return {
    data: {
      name,
      question,
      description,
      startDate: utcDay(startKey),
      endDate: utcDay(endKey),
      defaultValue,
      form: { enabled, opensAt, closesAt, audience, rollNumbers },
    },
  }
}

export const createTag = async ({ user, body }) => {
  if (body?.kind && body.kind !== "standalone") return badRequest("Allocation tags are created from the dining period form")
  const { error, data } = await validateStandalone(body)
  if (error) return badRequest(error)
  const tag = await tagOwner.createTag({ ...data, kind: "standalone", createdBy: user?._id || null })
  return success(await serializeOne(tag), 201, "Tag created")
}

const loadTag = async (id) => {
  if (!isObjectId(id)) return { error: badRequest("Invalid tag") }
  const tag = await tagQueries.findTagById(id)
  return tag ? { tag } : { error: notFound("Dining tag") }
}

export const updateTag = async ({ params, body }) => {
  const { tag, error } = await loadTag(params.id)
  if (error) return error
  if (tag.kind !== "standalone") return badRequest("Allocation tags are edited from the dining period form")
  const validation = await validateStandalone(body, tag)
  if (validation.error) return badRequest(validation.error)
  const updated = await tagOwner.updateTag(tag._id, validation.data)
  return success(await serializeOne(updated), 200, "Tag updated")
}

export const setTagArchived = async ({ params, body }) => {
  const { tag, error } = await loadTag(params.id)
  if (error) return error
  if (typeof body?.isArchived !== "boolean") return badRequest("isArchived must be true or false")
  if (!body.isArchived && tag.isArchived) {
    const scope = tag.kind === "period" ? { kind: "period", periodId: tag.periodId } : { kind: "standalone" }
    const clashes = await tagQueries.findLiveTagsByName(tag.name, scope)
    if (clashes.some((other) => idOf(other) !== idOf(tag))) return badRequest(`A live tag named "${tag.name}" already exists`)
  }
  const updated = await tagOwner.setTagArchived(tag._id, body.isArchived)
  return success(await serializeOne(updated), 200, body.isArchived ? "Tag archived" : "Tag restored")
}

// ---------------------------------------------------------------- students

const hostelName = (profile) => profile?.currentRoomAllocation?.hostelId?.name || null

const serializeRow = ({ userId, profile, rollNumber, valueRow, tag }) => {
  const value = valueRow ? valueRow.value : null
  return {
    studentUserId: idOf(userId),
    name: profile?.userId?.name || "",
    rollNumber: profile?.rollNumber || rollNumber || "",
    profileImage: profile?.userId?.profileImage || "",
    hostel: hostelName(profile),
    value,
    effective: value ?? tag.defaultValue ?? null,
    source: valueRow?.source || null,
    updatedAt: valueRow?.updatedAt || null,
  }
}

const VALUE_FILTERS = new Set(["yes", "no", "unanswered"])

/**
 * Student roster of one tag, with answers.
 *
 * Who is on the roster:
 * - period tag: the students allocated in that period (answers of anyone else
 *   are irrelevant, the tag never applies to them).
 * - standalone, custom form audience: the audience roll list (active or not),
 *   plus anyone outside it who has an explicit answer (set by the office/CSV).
 * - standalone, all-active audience or no form: ONLY students with an explicit
 *   answer — listing every active student would be the whole institute. So the
 *   `unanswered` filter returns no rows; counts.unanswered / counts.total are
 *   still computed against the active-student count. As a convenience, a
 *   `search` that is exactly an active student's roll number adds that student
 *   (unanswered) so the office can set them without a CSV.
 *
 * `value` filters on the EXPLICIT answer (yes / no / unanswered), not the
 * effective one. `search` matches name or roll number (case-insensitive).
 * Sorted by roll number; page is 1-based, limit ≤ 200 (default 50).
 */
export const getTagStudents = async ({ params, query = {} }) => {
  const { tag, error } = await loadTag(params.id)
  if (error) return error
  const valueFilter = query.value ? String(query.value) : ""
  if (valueFilter && !VALUE_FILTERS.has(valueFilter)) return badRequest("value must be yes, no or unanswered")
  const page = Math.max(1, Math.floor(Number(query.page) || 1))
  const limit = Math.min(200, Math.max(1, Math.floor(Number(query.limit) || 50)))
  const search = String(query.search || "").trim().toLowerCase()

  const values = await tagQueries.findValuesByTag(tag._id)
  const valueByUser = new Map(values.map((row) => [idOf(row.studentUserId), row]))

  let rosterIds = []
  let activeTotal = null
  if (tag.kind === "period") {
    const allocations = tag.periodId ? await allocationQueries.findAllocationsByPeriod(tag.periodId) : []
    rosterIds = allocations.map((row) => idOf(row.studentUserId))
  } else if (tag.form?.audience === "custom" && (tag.form.rollNumbers || []).length) {
    const profiles = await studentProfileQueries.findByRollNumbers(tag.form.rollNumbers, { select: "userId", lean: true })
    rosterIds = [...profiles.map((profile) => idOf(profile.userId)), ...valueByUser.keys()]
  } else {
    rosterIds = [...valueByUser.keys()]
    activeTotal = await studentProfileQueries.countProfiles({ status: "Active" })
    if (search && valueFilter !== "yes" && valueFilter !== "no") {
      const match = await studentProfileQueries.findActiveByRollNumbers([normalizeRoll(search)], { select: "userId", lean: true })
      match.forEach((profile) => rosterIds.push(idOf(profile.userId)))
    }
  }
  rosterIds = [...new Set(rosterIds.filter(Boolean))]

  const profiles = rosterIds.length ? await studentProfileQueries.findDiningStudentDetailsByUserIds(rosterIds) : []
  const profileByUser = new Map(profiles.map((profile) => [idOf(profile.userId), profile]))
  const rows = rosterIds
    .map((userId) => serializeRow({ userId, profile: profileByUser.get(userId), rollNumber: valueByUser.get(userId)?.rollNumber, valueRow: valueByUser.get(userId), tag }))
    .sort((a, b) => a.rollNumber.localeCompare(b.rollNumber))

  const counts = { yes: 0, no: 0, unanswered: 0, total: 0 }
  if (activeTotal === null) {
    rows.forEach((row) => {
      if (row.value === true) counts.yes += 1
      else if (row.value === false) counts.no += 1
      else counts.unanswered += 1
    })
    counts.total = rows.length
  } else {
    values.forEach((row) => (row.value ? (counts.yes += 1) : (counts.no += 1)))
    // Approximation: every answer is assumed to belong to an active student.
    counts.unanswered = Math.max(0, activeTotal - values.length)
    counts.total = counts.yes + counts.no + counts.unanswered
  }

  const filtered = rows.filter((row) => {
    if (valueFilter === "yes" && row.value !== true) return false
    if (valueFilter === "no" && row.value !== false) return false
    if (valueFilter === "unanswered" && row.value !== null) return false
    if (search && !row.name.toLowerCase().includes(search) && !row.rollNumber.toLowerCase().includes(search)) return false
    return true
  })
  const items = filtered.slice((page - 1) * limit, page * limit)
  return success({ items, total: filtered.length, page, limit, counts })
}

export const setStudentValue = async ({ user, params, body }) => {
  const { tag, error } = await loadTag(params.id)
  if (error) return error
  const { studentUserId } = params
  if (!isObjectId(studentUserId)) return badRequest("Invalid student")
  const value = body?.value
  if (value !== null && typeof value !== "boolean") return badRequest("value must be true, false or null")

  const [profile] = await studentProfileQueries.findDiningStudentDetailsByUserIds([studentUserId])
  if (!profile) return notFound("Student")
  if (tag.kind === "period") {
    const allocation = tag.periodId ? await allocationQueries.findAllocation(tag.periodId, studentUserId) : null
    if (!allocation) return badRequest("This student is not allocated in the tag's dining period")
  }

  let valueRow = null
  if (value === null) {
    await tagOwner.clearValue(tag._id, studentUserId)
  } else {
    valueRow = await tagOwner.setValue({
      tagId: tag._id,
      studentUserId,
      studentProfileId: profile._id,
      rollNumber: profile.rollNumber,
      value,
      source: "admin",
      updatedBy: user?._id || null,
    })
  }
  return success(serializeRow({ userId: studentUserId, profile, valueRow, tag }), 200, value === null ? "Answer cleared" : "Answer saved")
}

/**
 * Bulk answers from a CSV the frontend parsed: entries [{ rollNumber, value }].
 * Skip reasons: "Missing roll number", "Invalid value", "Duplicate roll number"
 * (the first occurrence wins), "Student not found", "Not allocated in this
 * period" (period tags only).
 */
export const bulkSetStudentValues = async ({ user, params, body }) => {
  const { tag, error } = await loadTag(params.id)
  if (error) return error
  const entries = body?.entries
  if (!Array.isArray(entries) || !entries.length) return badRequest("entries must be a non-empty list")
  if (entries.length > MAX_BULK_ENTRIES) return badRequest(`At most ${MAX_BULK_ENTRIES} entries are allowed per upload`)

  const skipped = []
  const wanted = new Map()
  entries.forEach((entry) => {
    const rollNumber = normalizeRoll(entry?.rollNumber)
    if (!rollNumber) return skipped.push({ rollNumber: String(entry?.rollNumber ?? ""), reason: "Missing roll number" })
    const value = parseTagBoolean(entry?.value)
    if (value === undefined) return skipped.push({ rollNumber, reason: "Invalid value" })
    if (wanted.has(rollNumber)) return skipped.push({ rollNumber, reason: "Duplicate roll number" })
    wanted.set(rollNumber, value)
  })

  const profiles = wanted.size ? await studentProfileQueries.findByRollNumbers([...wanted.keys()], { select: "_id userId rollNumber", lean: true }) : []
  const profileByRoll = new Map(profiles.map((profile) => [normalizeRoll(profile.rollNumber), profile]))
  let allocated = null
  if (tag.kind === "period") {
    const allocations = tag.periodId ? await allocationQueries.findAllocationsByPeriod(tag.periodId) : []
    allocated = new Set(allocations.map((row) => idOf(row.studentUserId)))
  }

  const rows = []
  wanted.forEach((value, rollNumber) => {
    const profile = profileByRoll.get(rollNumber)
    if (!profile) return skipped.push({ rollNumber, reason: "Student not found" })
    if (allocated && !allocated.has(idOf(profile.userId))) return skipped.push({ rollNumber, reason: "Not allocated in this period" })
    rows.push({ studentUserId: profile.userId, studentProfileId: profile._id, rollNumber, value })
  })

  const updated = rows.length ? await tagOwner.bulkSetValues(tag._id, rows, { source: "csv", updatedBy: user?._id || null }) : 0
  return success({ updated, skipped }, 200, `${updated} answer${updated === 1 ? "" : "s"} saved`)
}

export default { listTags, createTag, updateTag, setTagArchived, getTagStudents, setStudentValue, bulkSetStudentValues }
