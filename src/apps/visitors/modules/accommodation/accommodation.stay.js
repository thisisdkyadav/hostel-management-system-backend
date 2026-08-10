/**
 * Stay window helpers.
 *
 * A guest day runs 11:00 → 11:00, so `nights` is a plain count of calendar days
 * between the two dates and never depends on the times. Checking in before 11:00
 * or out after 11:00 is an *extension*: the hours are recorded so the hostel
 * holds the room across them, but they do not change the charge.
 *
 * fromDate/toDate stay date-only for exactly this reason — putting the clock
 * time into the stored date would make a night count shift with the timezone.
 */

import { STANDARD_CHECK_HOUR, STANDARD_CHECK_TIME, TIME_OF_DAY_RE } from "./accommodation.constants.js"

/** "HH:mm" -> hours as a float (e.g. "09:30" -> 9.5). NaN if malformed. */
export const parseTimeOfDay = (value) => {
  const match = TIME_OF_DAY_RE.exec(String(value || "").trim())
  if (!match) return NaN
  return Number(match[1]) + Number(match[2]) / 60
}

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Normalize the submitted times and derive the extension hours.
 * Returns { checkInTime, checkOutTime, earlyCheckInHours, lateCheckOutHours }
 * or { error } when a time is malformed.
 */
export const resolveStayTimes = ({ checkInTime, checkOutTime } = {}) => {
  const inTime = String(checkInTime || STANDARD_CHECK_TIME).trim()
  const outTime = String(checkOutTime || STANDARD_CHECK_TIME).trim()

  const inHours = parseTimeOfDay(inTime)
  const outHours = parseTimeOfDay(outTime)
  if (Number.isNaN(inHours)) return { error: "Check-in time must be a valid time of day (HH:MM)" }
  if (Number.isNaN(outHours)) return { error: "Check-out time must be a valid time of day (HH:MM)" }

  return {
    checkInTime: inTime,
    checkOutTime: outTime,
    earlyCheckInHours: round2(Math.max(0, STANDARD_CHECK_HOUR - inHours)),
    lateCheckOutHours: round2(Math.max(0, outHours - STANDARD_CHECK_HOUR)),
  }
}

/** True when the stay asks for any time outside the standard window. */
export const hasExtension = (stay = {}) =>
  (stay.earlyCheckInHours || 0) > 0 || (stay.lateCheckOutHours || 0) > 0

/** Human summary for emails and staff screens, e.g. "2h early check-in". */
export const describeExtension = (stay = {}) => {
  const parts = []
  if ((stay.earlyCheckInHours || 0) > 0) parts.push(`${stay.earlyCheckInHours}h early check-in`)
  if ((stay.lateCheckOutHours || 0) > 0) parts.push(`${stay.lateCheckOutHours}h late check-out`)
  return parts.join(" · ")
}

export { STANDARD_CHECK_TIME }
