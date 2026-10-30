/**
 * Dining tag resolution: which tags a student has, and on which days.
 * Shared by the roster, caterer headcounts and scan screens so they agree.
 *
 * - A period tag applies on its period's days, to students allocated in it.
 * - A standalone tag applies on its own startDate..endDate.
 * - Effective value = the student's answer ?? the tag's defaultValue ?? null.
 *
 * Day keys are "YYYY-MM-DD"; tag/period dates are UTC-midnight calendar days.
 */

import mongoose from "mongoose"
import { tagQueries } from "./tagQueries.service.js"
import { diningQueries } from "./diningQueries.service.js"

const idOf = (value) => String(value?._id || value || "")
const keyOf = (date) => (date ? new Date(date).toISOString().slice(0, 10) : "")
const utcDay = (key) => new Date(`${key}T00:00:00.000Z`)

/** Public shape of a tag for read screens. */
export const serializeTagSummary = (tag, period = null) => ({
  id: idOf(tag),
  kind: tag.kind,
  name: tag.name,
  question: tag.question || "",
  defaultValue: tag.defaultValue ?? null,
  periodId: tag.periodId ? idOf(tag.periodId) : null,
  startDate: tag.kind === "period" ? keyOf(period?.startDate) || null : keyOf(tag.startDate) || null,
  endDate: tag.kind === "period" ? keyOf(period?.endDate) || null : keyOf(tag.endDate) || null,
})

/**
 * Load the tags in play for `periods` (lean DiningPeriod docs) over [fromKey, toKey]
 * and the answers of `studentUserIds`. Returns:
 * - tags: serialized summaries (period tags first), each with `from`/`to` keys
 * - valueOf(tagId, userId) → { value, effective, source }
 * - activeOn(tag, dayKey) → boolean (calendar check only)
 * - appliesOn(tag, dayKey, { periodId }) → calendar check plus, for period tags, "of this period"
 * - yesTagsOn(userId, dayKey, { periodId }) → [{ id, name }] effective-yes tags that day.
 *   periodId = the period the student is allocated in (period tags of other periods never apply).
 * - tagCountsOn(dayKey, { periodId, userIds }) → [{ id, name, count }] for every tag applying
 *   that day (count may be 0): how many of `userIds` (the day's expected eaters, allocated in
 *   `periodId`) have it.
 * - studentTagMap(userId) → { [tagId]: { value, effective, source } } over every loaded tag.
 */
export const loadTagContext = async ({ periods = [], fromKey, toKey, studentUserIds = [] }) => {
  const periodById = new Map(periods.map((period) => [idOf(period), period]))
  const tagDocs = await tagQueries.findTagsInRange({
    periodIds: periods.map((period) => period._id),
    from: utcDay(fromKey),
    to: utcDay(toKey),
  })
  const tags = tagDocs.map((tag) => {
    const summary = serializeTagSummary(tag, periodById.get(idOf(tag.periodId)))
    return { ...summary, from: summary.startDate, to: summary.endDate }
  })
  const tagById = new Map(tags.map((tag) => [tag.id, tag]))

  const answers = new Map()
  if (tags.length && studentUserIds.length) {
    const rows = await tagQueries.findValues({
      tagIds: tags.map((tag) => new mongoose.Types.ObjectId(tag.id)),
      studentUserIds: [...new Set(studentUserIds.map(idOf))].map((id) => new mongoose.Types.ObjectId(id)),
    })
    rows.forEach((row) => answers.set(`${idOf(row.tagId)}|${idOf(row.studentUserId)}`, row))
  }

  const valueOf = (tagId, userId) => {
    const row = answers.get(`${tagId}|${idOf(userId)}`)
    const tag = tagById.get(tagId)
    const value = row ? row.value : null
    return { value, effective: value ?? tag?.defaultValue ?? null, source: row?.source || null }
  }
  const activeOn = (tag, dayKey) => Boolean(tag.from && tag.to && dayKey >= tag.from && dayKey <= tag.to)
  const appliesOn = (tag, dayKey, { periodId } = {}) =>
    (tag.kind !== "period" || (Boolean(periodId) && tag.periodId === idOf(periodId))) && activeOn(tag, dayKey)
  const yesTagsOn = (userId, dayKey, { periodId } = {}) => tags
    .filter((tag) => appliesOn(tag, dayKey, { periodId }))
    .filter((tag) => valueOf(tag.id, userId).effective === true)
    .map((tag) => ({ id: tag.id, name: tag.name }))
  const tagCountsOn = (dayKey, { periodId, userIds = [] } = {}) => tags
    .filter((tag) => appliesOn(tag, dayKey, { periodId }))
    .map((tag) => ({
      id: tag.id,
      name: tag.name,
      count: [...userIds].reduce((sum, userId) => (valueOf(tag.id, userId).effective === true ? sum + 1 : sum), 0),
    }))
  const studentTagMap = (userId) => Object.fromEntries(tags.map((tag) => [tag.id, valueOf(tag.id, userId)]))

  return { tags, valueOf, activeOn, appliesOn, yesTagsOn, tagCountsOn, studentTagMap }
}

// Scans are bucketed at SERVER-LOCAL midnight (as in the caterer screens).
const localKey = (date) => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return ""
  return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Tags for a batch of meal scans (lean DiningMealVerification docs, populated or not):
 * one tag context for the whole batch. Returns tagsOf(scan) → [{ id, name }] effective-yes
 * tags on the scan's day. A "not-allocated" scan never gets the period's allocation tags.
 */
export const loadScanTags = async (scans = []) => {
  const usable = scans.filter((scan) => scan?.studentUserId && scan?.scannedAt && localKey(scan.scannedAt))
  if (!usable.length) return () => []
  const keys = usable.map((scan) => localKey(scan.scannedAt)).sort()
  const periodIds = [...new Set(usable.map((scan) => idOf(scan.periodId)).filter(Boolean))]
  const periods = periodIds.length
    ? await diningQueries.findPeriods({ _id: { $in: periodIds } }, { select: "startDate endDate", lean: true })
    : []
  const ctx = await loadTagContext({
    periods,
    fromKey: keys[0],
    toKey: keys.at(-1),
    studentUserIds: usable.map((scan) => idOf(scan.studentUserId)),
  })
  if (!ctx.tags.length) return () => []
  return (scan) => {
    if (!scan?.studentUserId || !scan?.scannedAt) return []
    const periodId = scan.status === "not-allocated" ? null : idOf(scan.periodId) || null
    return ctx.yesTagsOn(idOf(scan.studentUserId), localKey(scan.scannedAt), { periodId })
  }
}

export default { loadTagContext, loadScanTags, serializeTagSummary }
