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

export default resolveMealSlotsForDay
