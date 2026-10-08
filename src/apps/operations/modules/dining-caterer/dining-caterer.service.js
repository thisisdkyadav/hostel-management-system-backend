import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import { studentProfileQueries } from "../../../../services/student/studentProfileQueries.service.js"
import { badRequest, notFound } from "../../../../services/base/index.js"

export const idOf = (value) => String(value?._id || value || "")
export const serializeCaterer = (caterer) => ({ id: idOf(caterer), name: caterer.name, email: caterer.email })

// Match available-students: scans are bucketed at SERVER-LOCAL midnight.
// Rebates use their stored dateKeys verbatim, not timezone-converted instants.
export const dayKey = (date = new Date()) => {
  const d = new Date(date)
  if (Number.isNaN(d.getTime()) || d.getFullYear() < 1 || d.getFullYear() > 9999) {
    throw new RangeError("Invalid calendar date")
  }
  return `${String(d.getFullYear()).padStart(4, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
export const localDay = (key) => new Date(`${key}T00:00:00`)
const calendarDay = (key) => {
  if (typeof key !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const date = new Date(`${key}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.getUTCFullYear() >= 1 && date.toISOString().slice(0, 10) === key ? date : null
}
const calendarDayCount = (from, to) => {
  const start = calendarDay(from)
  const end = calendarDay(to)
  return start && end ? (end - start) / 86400000 + 1 : NaN
}
export const shiftDay = (key, days) => {
  const date = calendarDay(key)
  if (!date || !Number.isSafeInteger(days)) throw new RangeError("Invalid calendar day shift")
  date.setUTCDate(date.getUTCDate() + days)
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new RangeError("Calendar day shift is out of range")
  }
  // UTC calendar arithmetic keeps date keys stable across local DST changes.
  // Internal shifts may cross 2000/2100; query dates are bounded separately.
  return date.toISOString().slice(0, 10)
}
export const dayBounds = (key) => ({ $gte: localDay(key), $lt: localDay(shiftDay(key, 1)) })
export const dayKeys = (from, to) => {
  const count = calendarDayCount(from, to)
  // The largest calendar is 92 days plus yesterday for returning rebates.
  if (!Number.isSafeInteger(count) || count < 1 || count > 93) throw new RangeError("Invalid calendar range")
  const cursor = calendarDay(from)
  const keys = []
  for (let index = 0; index < count; index++) {
    keys.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return keys
}
const validDay = (value) => Boolean(calendarDay(value)) && value >= "2000-01-01" && value <= "2100-12-31"

/** Validate query types before constructing any Mongo filters. */
export const validateQuery = (query, { required = [], enums = {} } = {}) => {
  for (const key of required) {
    if (typeof query[key] !== "string" || !query[key].trim()) return badRequest(`${key} is required`)
  }
  for (const key of ["periodId", "date", "from", "to", "mealSlotKey", "status", "search", "page", "limit"]) {
    const value = query[key]
    if (value === undefined) continue
    if (typeof value !== "string") return badRequest(`${key} must be a single string`)
    if (key === "periodId" && !/^[a-f\d]{24}$/i.test(value)) return badRequest("periodId must be a valid ObjectId")
    if (["date", "from", "to"].includes(key) && !validDay(value)) return badRequest(`${key} must be a valid YYYY-MM-DD date between 2000-01-01 and 2100-12-31`)
    if (enums[key] && !enums[key].includes(value)) return badRequest(`${key} must be one of: ${enums[key].join(", ")}`)
    if (["page", "limit"].includes(key) && (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))) {
      return badRequest(`${key} must be a positive integer`)
    }
    if (key === "limit" && Number(value) > 100) return badRequest("limit must be between 1 and 100")
  }
  if (query.from && query.to && query.from > query.to) return badRequest("from must be on or before to")
  if (!Number.isSafeInteger((Number(query.page || 1) - 1) * Number(query.limit || 20))) return badRequest("page is too large")
  return null
}

export const validateRange = (from, to, maxDays) => {
  const count = calendarDayCount(from, to)
  if (!Number.isSafeInteger(count)) return badRequest("Date range must contain valid YYYY-MM-DD dates")
  if (count < 1) return badRequest("from must be on or before to")
  // UTC arithmetic measures calendar days even across server-local DST changes.
  if (count > maxDays) {
    return badRequest(`Date range must not exceed ${maxDays} days`)
  }
  return null
}

export const getCatererScope = async (user, query = {}, validation = {}) => {
  const caterer = await diningQueries.findOneCaterer({ userId: user?._id, isArchived: false }, { lean: true })
  if (!caterer) return { error: notFound("Caterer login") }
  const error = validateQuery(query, validation)
  return { caterer, error }
}

export const getPeriodScope = async (user, query) => {
  const scope = await getCatererScope(user, query, { required: ["periodId"] })
  if (scope.error) return scope
  const period = await diningQueries.findPeriodById(query.periodId, { lean: true })
  if (!period) return { error: notFound("Dining period") }
  if (!period.catererIds.some((id) => idOf(id) === idOf(scope.caterer))) {
    return { error: badRequest("periodId must belong to this caterer") }
  }
  return { ...scope, period }
}

export const mealSlots = (period) => (period.mealSlots || []).map((slot) => ({
  key: String(slot.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
  name: slot.name,
  startTime: slot.startTime,
  endTime: slot.endTime,
}))
const minutes = (time) => time.split(":").reduce((hours, mins) => Number(hours) * 60 + Number(mins))
export const mealState = (date, slot, now = new Date()) => {
  const today = dayKey(now)
  if (date < today) return "ended"
  if (date > today) return "upcoming"
  const current = now.getHours() * 60 + now.getMinutes()
  const start = minutes(slot.startTime)
  const end = minutes(slot.endTime)
  // Overnight slots keep the existing scan-calendar-day semantics: the early
  // morning and late evening windows both serve on this date, with the evening
  // window still upcoming between them. Past calendar days are ended.
  if (start > end) return current >= start || current <= end ? "serving" : "upcoming"
  if (current < start) return "upcoming"
  return current <= end ? "serving" : "ended"
}
export const serializePeriod = (period) => ({ id: idOf(period), startDate: dayKey(period.startDate), endDate: dayKey(period.endDate) })

export const studentDetails = async (userIds) => {
  if (!userIds.length) return new Map()
  const profiles = await studentProfileQueries.findDiningStudentDetailsByUserIds([...new Set(userIds.map(idOf))])
  return new Map(profiles.map((profile) => [idOf(profile.userId), profile]))
}
export const serializeStudent = (profile, fallback = {}) => {
  const user = profile?.userId
  const allocation = profile?.currentRoomAllocation
  const hostel = allocation?.hostelId
  const room = allocation?.roomId
  const unit = room?.unitId?.unitNumber
  return {
    id: idOf(user || fallback.studentUserId),
    profileId: profile ? idOf(profile) : idOf(fallback.studentProfileId) || null,
    name: user?.name || "",
    email: user?.email || "",
    rollNumber: profile?.rollNumber || fallback.rollNumber || "",
    profileImage: user?.profileImage || "",
    department: profile?.department || "",
    degree: profile?.degree || "",
    batch: profile?.batch || "",
    hostel: hostel?.name ? { id: idOf(hostel), name: hostel.name } : null,
    room: room?.roomNumber ? { displayRoom: unit ? `${unit}-${room.roomNumber}` : room.roomNumber } : null,
  }
}
