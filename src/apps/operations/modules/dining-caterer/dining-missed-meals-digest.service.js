/**
 * Nightly "missed meals" digest for hostel supervisors.
 *
 * Shortly after 01:00 (server-local) every day, find the students who were
 * expected to eat yesterday — allocated to a caterer, meals served that day,
 * no approved rebate — but have no verified meal at any caterer for the whole
 * day. Each hostel supervisor gets one email listing such students of the
 * hostels they handle (active hostel or any assigned hostel), with how many
 * expected days in a row each student has gone without a meal. Students with
 * no hostel are not reported to anyone.
 */

import { emailService } from "../../../../services/email/email.service.js"
import { customEmailTemplate } from "../../../../services/email/email.templates.js"
import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"
import { countsRebates } from "../../../../services/dining/rebateScope.js"
import { staffRolesQueries } from "../../../../services/user/staffRolesQueries.service.js"
import { withLock } from "../../../../services/lock/distributedLock.js"
import { idOf, dayKey, shiftDay, localDay, dayKeys, mealSlots, studentDetails, serializeStudent } from "./dining-caterer.service.js"

// Local hour from which the digest for yesterday goes out.
export const DIGEST_HOUR = 1
// How far back "days missed" is counted; a streak reaching it is shown as "N+".
export const LOOKBACK_DAYS = 60

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])
const csvCell = (value) => {
  const text = String(value ?? "")
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
const formatDay = (key) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
const formatMeal = (row) =>
  row.lastMealAt ? `${row.lastMealName || "Meal"}, ${formatDay(dayKey(row.lastMealAt))}` : "None recorded"
// Period dates are stored as UTC midnight of the calendar day.
const localDayUtc = (key) => new Date(`${key}T00:00:00.000Z`)
const daysLabel = (row) => (row.capped ? `${row.daysMissed}+` : String(row.daysMissed))

/**
 * Students who had no meal anywhere on `date` although expected to eat, with
 * their streak of expected days without a meal ending on `date`.
 * Returns [{ student, hostel:{id,name}|null, caterer:{id,name}|null, daysMissed, capped, lastMealAt, lastMealName }].
 */
export const findStudentsWhoMissedMeals = async (date) => {
  const from = shiftDay(date, -(LOOKBACK_DAYS - 1))
  const periods = await diningQueries.findPeriods(
    { isArchived: { $ne: true }, startDate: { $lte: localDayUtc(date) }, endDate: { $gte: localDayUtc(from) } },
    { lean: true }
  )
  if (!periods.length) return []

  // Allocations of every period touching the lookback, keyed by student.
  const allocationsByPeriod = await Promise.all(periods.map((period) => allocationQueries.findAllocationsByPeriod(period._id)))
  const byStudent = new Map()
  periods.forEach((period, index) => {
    for (const row of allocationsByPeriod[index]) {
      const id = idOf(row.studentUserId)
      if (!byStudent.has(id)) byStudent.set(id, [])
      byStudent.get(id).push({ period, row })
    }
  })

  const slotsCache = new Map()
  const servesMeals = (period, key) => {
    const cacheKey = `${idOf(period)}:${key}`
    if (!slotsCache.has(cacheKey)) {
      const covers = dayKey(period.startDate) <= key && key <= dayKey(period.endDate)
      slotsCache.set(cacheKey, covers && mealSlots(period, key).length > 0)
    }
    return slotsCache.get(cacheKey)
  }
  // The allocation a student eats under on `key`: allocated before the day began, meals served that day.
  const allocationOn = (studentId, key) => {
    const dayStart = localDay(key)
    return (byStudent.get(studentId) || []).find(({ period, row }) =>
      servesMeals(period, key) && (!row.createdAt || new Date(row.createdAt) <= dayStart)) || null
  }

  const candidates = [...byStudent.keys()].filter((studentId) => allocationOn(studentId, date))
  if (!candidates.length) return []

  const [ateOnDate, rebates] = await Promise.all([
    diningQueries.distinctVerifiedStudents({ studentUserId: { $in: candidates }, scannedAt: { $gte: localDay(date), $lt: localDay(shiftDay(date, 1)) } }),
    diningQueries.findRebates(
      { studentUserId: { $in: candidates }, status: "approved", dateKeys: { $in: dayKeys(from, date) } },
      { lean: true, select: "studentUserId dateKeys" }
    ),
  ])
  const ate = new Set(ateOnDate.map(idOf))
  const awayDays = new Map()
  for (const rebate of rebates) {
    const id = idOf(rebate.studentUserId)
    if (!awayDays.has(id)) awayDays.set(id, new Set())
    rebate.dateKeys.forEach((key) => awayDays.get(id).add(key))
  }
  // A rebate day excuses the student only under a rebate-counting (registered) allocation.
  const expectedOn = (studentId, key) => {
    const allocation = allocationOn(studentId, key)
    if (!allocation) return false
    return !(countsRebates(allocation.row) && awayDays.get(studentId)?.has(key))
  }

  const missed = candidates.filter((studentId) => !ate.has(studentId) && expectedOn(studentId, date))
  if (!missed.length) return []

  const rollOf = (studentId) => byStudent.get(studentId)[0].row.rollNumber
  const [profiles, lastMeals, caterers] = await Promise.all([
    studentDetails(missed),
    diningQueries.aggregateLastVerifiedByRollNumbers(missed.map(rollOf).filter(Boolean), localDay(date)),
    diningQueries.findCaterers({}, { lean: true, select: "name" }),
  ])
  const lastByRoll = new Map(lastMeals.map((item) => [item._id, item]))
  const catererName = new Map(caterers.map((doc) => [idOf(doc), doc.name]))

  return missed.map((studentId) => {
    const roll = rollOf(studentId)
    const last = lastByRoll.get(roll)
    const lastMealDay = last ? dayKey(last.scannedAt) : null
    // Count expected days back from `date` until the last meal or the lookback edge;
    // rebate days and days without service are skipped, not counted.
    let daysMissed = 0
    let key = date
    for (let step = 0; step < LOOKBACK_DAYS && (!lastMealDay || key > lastMealDay); step += 1) {
      if (expectedOn(studentId, key)) daysMissed += 1
      key = shiftDay(key, -1)
    }
    const student = serializeStudent(profiles.get(studentId), byStudent.get(studentId)[0].row)
    const current = allocationOn(studentId, date).row
    return {
      student,
      hostel: student.hostel,
      caterer: current.catererId ? { id: idOf(current.catererId), name: catererName.get(idOf(current.catererId)) || "" } : null,
      daysMissed,
      // No meal inside the lookback and already allocated at its start: the real streak may be longer.
      capped: (!lastMealDay || lastMealDay < from) && Boolean(allocationOn(studentId, from)),
      lastMealAt: last?.scannedAt || null,
      lastMealName: last?.mealSlotName || null,
    }
  }).sort((a, b) => b.daysMissed - a.daysMissed || a.student.rollNumber.localeCompare(b.student.rollNumber))
}

/** Supervisors (with an email) responsible for any of `hostelIds`, each with the hostels they cover. */
const supervisorsFor = async (hostelIds) => {
  const profiles = await staffRolesQueries.findManyByRole(
    "HostelSupervisor",
    { $or: [{ activeHostelId: { $in: hostelIds } }, { hostelIds: { $in: hostelIds } }] },
    { populate: { path: "userId", select: "email name" }, lean: true }
  )
  const wanted = new Set(hostelIds.map(idOf))
  const byEmail = new Map()
  for (const profile of profiles) {
    const email = String(profile.userId?.email || "").trim().toLowerCase()
    if (!email) continue
    const entry = byEmail.get(email) || { email, name: profile.userId?.name || "", hostelIds: new Set() }
    for (const id of [profile.activeHostelId, ...(profile.hostelIds || [])].map(idOf)) {
      if (wanted.has(id)) entry.hostelIds.add(id)
    }
    byEmail.set(email, entry)
  }
  return [...byEmail.values()].filter((entry) => entry.hostelIds.size > 0)
}

const buildEmail = ({ date, supervisorName, sections }) => {
  const total = sections.reduce((sum, section) => sum + section.rows.length, 0)
  const subject = `Students who missed all meals on ${formatDay(date)} (${total})`
  const tables = sections.map(({ hostel, rows }) => `
    <h3 style="margin:20px 0 8px;">${esc(hostel.name)} — ${rows.length} student${rows.length === 1 ? "" : "s"}</h3>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-size:13px;width:100%;">
      <thead><tr style="background:#f3f4f6;text-align:left;">
        <th>Roll number</th><th>Name</th><th>Email</th><th>Days missed</th><th>Last meal</th><th>Caterer</th>
      </tr></thead>
      <tbody>${rows.map((row) => `<tr>
        <td>${esc(row.student.rollNumber)}</td><td>${esc(row.student.name)}</td><td>${esc(row.student.email)}</td>
        <td style="text-align:center;"><strong>${esc(daysLabel(row))}</strong></td>
        <td>${esc(formatMeal(row))}</td><td>${esc(row.caterer?.name || "")}</td>
      </tr>`).join("")}</tbody>
    </table>`).join("")
  const body = `
    <p>Dear ${esc(supervisorName || "Supervisor")},</p>
    <p>The following students of your hostel${sections.length > 1 ? "s" : ""} had <strong>no meal at any caterer</strong> on
    <strong>${esc(formatDay(date))}</strong>, although they are allocated to a caterer and were not on an approved rebate.
    <em>Days missed</em> counts the consecutive days they were expected to eat without a meal (rebate days are not counted).</p>
    ${tables}
    <p style="margin-top:16px;">They may have left campus without applying for a rebate, be unwell, or their face may not be recognised by the scanner. A CSV of this list is attached.</p>
  `
  const csv = [
    ["Hostel", "Roll number", "Name", "Email", "Days missed", "Last meal", "Caterer"].join(","),
    ...sections.flatMap(({ hostel, rows }) => rows.map((row) =>
      [hostel.name, row.student.rollNumber, row.student.name, row.student.email, daysLabel(row), formatMeal(row), row.caterer?.name || ""]
        .map(csvCell).join(","))),
  ].join("\n")
  return {
    subject,
    html: customEmailTemplate(body, subject),
    attachments: [{ filename: `missed-meals-${date}.csv`, content: csv, contentType: "text/csv" }],
  }
}

/**
 * Build and send the digest for `date` (default: yesterday). With `dryRun`
 * nothing is sent. Returns { date, students, supervisors, sent, failed, emails }.
 */
export const sendMissedMealsDigest = async ({ now = new Date(), date = null, dryRun = false } = {}) => {
  const day = date || shiftDay(dayKey(now), -1)
  const rows = (await findStudentsWhoMissedMeals(day)).filter((row) => row.hostel?.id)
  const result = { date: day, students: rows.length, supervisors: 0, sent: 0, failed: 0, emails: [] }
  if (!rows.length) return result

  const byHostel = new Map()
  for (const row of rows) {
    if (!byHostel.has(row.hostel.id)) byHostel.set(row.hostel.id, { hostel: row.hostel, rows: [] })
    byHostel.get(row.hostel.id).rows.push(row)
  }
  const supervisors = await supervisorsFor([...byHostel.keys()])
  result.supervisors = supervisors.length

  for (const supervisor of supervisors) {
    const sections = [...supervisor.hostelIds].map((id) => byHostel.get(id))
      .sort((a, b) => a.hostel.name.localeCompare(b.hostel.name))
    const email = buildEmail({ date: day, supervisorName: supervisor.name, sections })
    result.emails.push({ to: supervisor.email, subject: email.subject, hostels: sections.map((s) => s.hostel.name), students: sections.reduce((n, s) => n + s.rows.length, 0) })
    if (dryRun) continue
    try {
      const sent = await emailService.sendEmail({ to: supervisor.email, ...email })
      if (sent?.success) result.sent += 1
      else {
        result.failed += 1
        console.error(`[missed-meals] email to ${supervisor.email} failed:`, sent?.error || "unknown error")
      }
    } catch (error) {
      result.failed += 1
      console.error(`[missed-meals] email to ${supervisor.email} failed:`, error?.message || error)
    }
  }
  return result
}

/**
 * Scheduler entry (called every minute): from DIGEST_HOUR local time, send
 * yesterday's digest once per day across all instances.
 */
export const runDueMissedMealsDigest = async ({ now = new Date() } = {}) => {
  if (now.getHours() < DIGEST_HOUR) return null
  return withLock(`lock:cron:dining-missed-meals:${dayKey(now)}`, 26 * 60 * 60, async () => {
    const result = await sendMissedMealsDigest({ now })
    if (result.students > 0) {
      console.log(`[scheduler] missed-meals digest ${result.date}: ${result.students} student(s), ${result.sent}/${result.supervisors} supervisor email(s) sent`)
    }
    return result
  }, { release: false })
}
