/**
 * Meal schedule resolution (pure, no model access).
 *
 * A period's `mealSlots` is the canonical meal list + default timings. Timings
 * can vary by day: `weekSchedule` overrides per weekday (0 = Sunday) and
 * `dateSchedule` overrides one calendar date (YYYY-MM-DD). Precedence:
 * date > weekday > default. A meal marked `closed` is not served that day.
 */

const localDateKey = (date) => {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const nameKey = (name) => String(name || "").trim().toLowerCase()

/**
 * Meal slots ({ name, startTime, endTime }) in effect on a day.
 * @param {object} period
 * @param {string|Date} day - "YYYY-MM-DD" or a Date (local calendar day)
 */
export const resolveMealSlotsForDay = (period = {}, day = new Date()) => {
  const base = Array.isArray(period.mealSlots) ? period.mealSlots : []
  const key = typeof day === "string" ? day : localDateKey(day)
  const weekday = new Date(`${key}T00:00:00`).getDay()
  const dateEntry = (period.dateSchedule || []).find((entry) => entry.date === key)
  const weekEntry = (period.weekSchedule || []).find((entry) => Number(entry.weekday) === weekday)
  const overrides = [weekEntry, dateEntry]
    .filter(Boolean)
    .flatMap((entry) => entry.slots || [])
    .reduce((map, slot) => map.set(nameKey(slot.name), slot), new Map())

  return base
    .map((slot) => {
      const override = overrides.get(nameKey(slot.name))
      if (!override) return { name: slot.name, startTime: slot.startTime, endTime: slot.endTime }
      if (override.closed) return null
      return { name: slot.name, startTime: override.startTime || slot.startTime, endTime: override.endTime || slot.endTime }
    })
    .filter(Boolean)
}

/**
 * Scans a little before or after a meal still count for that meal:
 * from MEAL_EARLY_BUFFER_MINUTES before it starts to MEAL_LATE_BUFFER_MINUTES
 * after it ends. Outside every meal and its buffer is "outside meal time".
 */
export const MEAL_EARLY_BUFFER_MINUTES = 30
export const MEAL_LATE_BUFFER_MINUTES = 60

const toMinutes = (value = "") => {
  const [hours, minutes] = String(value || "").split(":").map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

/**
 * How far `minute` (0..1439) is from a slot: 0 inside it, otherwise minutes
 * before its start (`early`) or after its end (`late`). Overnight slots
 * (22:00–02:00) wrap; a normal slot's buffer doesn't cross midnight.
 */
const distanceToSlot = (minute, slot) => {
  const start = toMinutes(slot.startTime)
  const end = toMinutes(slot.endTime)
  if (start === null || end === null) return null
  if (start <= end) {
    if (minute >= start && minute <= end) return { inside: true, early: 0, late: 0 }
    return minute < start ? { inside: false, early: start - minute, late: Infinity } : { inside: false, early: Infinity, late: minute - end }
  }
  if (minute >= start || minute <= end) return { inside: true, early: 0, late: 0 }
  return { inside: false, early: start - minute, late: minute - end }
}

/**
 * The meal a time belongs to, from the day's slots (resolveMealSlotsForDay).
 * Inside a meal's own window wins; otherwise the nearest meal whose buffer
 * covers the time. Returns { slot, match: "inside" | "early" | "late" } or null.
 */
export const findMealSlotForTime = (
  slots = [],
  date = new Date(),
  { earlyMinutes = MEAL_EARLY_BUFFER_MINUTES, lateMinutes = MEAL_LATE_BUFFER_MINUTES } = {}
) => {
  const minute = date.getHours() * 60 + date.getMinutes()
  let best = null
  for (const slot of slots) {
    const distance = distanceToSlot(minute, slot)
    if (!distance) continue
    if (distance.inside) return { slot, match: "inside" }
    const candidates = []
    if (distance.early <= earlyMinutes) candidates.push({ gap: distance.early, match: "early" })
    if (distance.late <= lateMinutes) candidates.push({ gap: distance.late, match: "late" })
    for (const candidate of candidates) {
      if (!best || candidate.gap < best.gap) best = { slot, ...candidate }
    }
  }
  return best ? { slot: best.slot, match: best.match } : null
}

export default resolveMealSlotsForDay
