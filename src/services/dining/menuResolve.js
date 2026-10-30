/**
 * Dining menu resolution: what a kitchen serves on a day.
 * Shared by the manage page, the caterer page and the student Dining page.
 *
 * - The weekly menu is a series of versions; day D uses the latest version
 *   with effectiveFrom <= D. A per-meal date override on D wins over it.
 * - Meal names and timings come from the dining period covering D that
 *   includes the caterer (resolveMealSlotsForDay); meals closed that day are
 *   listed with served:false. With no period, the meal names come from the
 *   menu data itself.
 * - Meal names match case-insensitively (trimmed).
 *
 * Day keys are server-local "YYYY-MM-DD", like the caterer modules.
 */

import { menuQueries } from "./menuQueries.service.js"
import { diningQueries } from "./diningQueries.service.js"
import { allocationQueries } from "./allocationQueries.service.js"
import { resolveMealSlotsForDay } from "./mealSchedule.js"

const MEAL_ORDER = ["breakfast", "lunch", "snacks", "dinner"]
const DEFAULT_MEALS = ["Breakfast", "Lunch", "Dinner"]

const idOf = (value) => String(value?._id || value || "")
export const mealKey = (name) => String(name || "").trim().toLowerCase()

const pad = (n) => String(n).padStart(2, "0")
/** Server-local calendar day of an instant. */
export const localKey = (date = new Date()) => {
  const d = new Date(date)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const utcDate = (key) => new Date(`${key}T00:00:00.000Z`)
export const weekdayOf = (key) => utcDate(key).getUTCDay()
export const shiftKey = (key, days) => {
  const date = utcDate(key)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
/** `key` plus `months` calendar months, clamped to the month's last day. */
export const addMonthsKey = (key, months) => {
  const [y, m, d] = key.split("-").map(Number)
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate()
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10)
}
export const rangeKeys = (from, to) => {
  const keys = []
  for (let key = from; key <= to; key = shiftKey(key, 1)) keys.push(key)
  return keys
}

const serializeItem = (item) => ({ name: item.name, diet: item.diet || "", special: Boolean(item.special) })

const sameMeal = (a, b) => {
  const left = a?.items || []
  const right = b?.items || []
  if ((a?.note || "") !== (b?.note || "") || left.length !== right.length) return false
  return left.every((item, index) => {
    const other = right[index]
    return item.name === other.name && (item.diet || "") === (other.diet || "") && Boolean(item.special) === Boolean(other.special)
  })
}

const orderMealNames = (names) => [...names].sort((a, b) => {
  const ia = MEAL_ORDER.indexOf(mealKey(a))
  const ib = MEAL_ORDER.indexOf(mealKey(b))
  if (ia !== ib) return (ia === -1 ? MEAL_ORDER.length : ia) - (ib === -1 ? MEAL_ORDER.length : ib)
  return mealKey(a).localeCompare(mealKey(b))
})

/** The version in effect on `date` from an ascending list, or null. */
export const versionFor = (versions = [], date) => {
  let found = null
  for (const version of versions) {
    if (version.effectiveFrom <= date) found = version
    else break
  }
  return found
}

/**
 * One resolved day. `versions` are the caterer's versions (ascending
 * effectiveFrom), `override` its DiningMenuDay for the date (or null). With
 * `caterer` null (a student with no allocation) the meals carry no items.
 */
export const resolveMenuDay = ({ date, today, caterer = null, period = null, versions = [], override = null }) => {
  const weekday = weekdayOf(date)
  const version = caterer ? versionFor(versions, date) : null
  const weekMeals = version?.days?.find((day) => Number(day.weekday) === weekday)?.meals || []
  const dateMeals = caterer ? override?.meals || [] : []
  const weekByKey = new Map(weekMeals.map((meal) => [mealKey(meal.name), meal]))
  const dateByKey = new Map(dateMeals.map((meal) => [mealKey(meal.name), meal]))

  let slots
  if (period) {
    const open = new Map(resolveMealSlotsForDay(period, date).map((slot) => [mealKey(slot.name), slot]))
    slots = (period.mealSlots || []).map((slot) => {
      const resolved = open.get(mealKey(slot.name))
      return resolved
        ? { name: slot.name, startTime: resolved.startTime || null, endTime: resolved.endTime || null, served: true }
        : { name: slot.name, startTime: null, endTime: null, served: false }
    })
  } else {
    const names = new Map()
    for (const meal of [...weekMeals, ...dateMeals]) {
      if (!names.has(mealKey(meal.name))) names.set(mealKey(meal.name), String(meal.name).trim())
    }
    const list = names.size ? orderMealNames([...names.values()]) : DEFAULT_MEALS
    slots = list.map((name) => ({ name, startTime: null, endTime: null, served: true }))
  }

  const weekFrom = version?.effectiveFrom || null
  const meals = slots.map((slot) => {
    const key = mealKey(slot.name)
    const dated = dateByKey.get(key)
    const weekly = weekByKey.get(key)
    if (dated) {
      return {
        ...slot, items: (dated.items || []).map(serializeItem), note: dated.note || "",
        source: "date", weekFrom, changed: !sameMeal(dated, weekly),
      }
    }
    if (weekly) {
      return { ...slot, items: (weekly.items || []).map(serializeItem), note: weekly.note || "", source: "week", weekFrom, changed: false }
    }
    return { ...slot, items: [], note: "", source: "none", weekFrom: null, changed: false }
  })

  return {
    date,
    weekday,
    isPast: date < today,
    isToday: date === today,
    caterer: caterer ? { id: idOf(caterer), name: caterer.name } : null,
    periodId: period ? idOf(period) : null,
    meals,
  }
}

/** Live periods overlapping [from, to], newest start first, with their day keys. */
const loadPeriods = async (from, to, filter = {}) => {
  const periods = await diningQueries.findPeriods(
    {
      isArchived: false,
      ...filter,
      startDate: { $lt: new Date(`${shiftKey(to, 2)}T00:00:00Z`) },
      endDate: { $gte: new Date(`${shiftKey(from, -1)}T00:00:00Z`) },
    },
    { lean: true, sort: { startDate: -1, _id: -1 } }
  )
  return periods
    .map((period) => ({ period, fromKey: localKey(period.startDate), toKey: localKey(period.endDate) }))
    .filter((entry) => entry.fromKey <= to && entry.toKey >= from)
}

const coveringPeriods = (entries, date) => entries.filter((entry) => entry.fromKey <= date && date <= entry.toKey)

/** Resolved days of one caterer for these (ascending) date keys. */
export const buildCatererMenuDays = async ({ caterer, dates, today = localKey() }) => {
  if (!dates.length) return []
  const from = dates[0]
  const to = dates[dates.length - 1]
  const [periods, versions, overrides] = await Promise.all([
    loadPeriods(from, to, { catererIds: caterer._id }),
    menuQueries.findWeeksForRange(caterer._id, from, to),
    menuQueries.findDayOverrides([caterer._id], dates),
  ])
  const overrideByDate = new Map(overrides.map((doc) => [doc.date, doc]))
  return dates.map((date) => resolveMenuDay({
    date,
    today,
    caterer,
    period: coveringPeriods(periods, date)[0]?.period || null,
    versions,
    override: overrideByDate.get(date) || null,
  }))
}

/**
 * Resolved days for a student: each day uses the caterer the student is
 * allocated to in the period covering it. Unallocated days list the period's
 * meals with no items; days with no period have no meals.
 */
export const buildStudentMenuDays = async ({ userId, dates, today = localKey() }) => {
  if (!dates.length) return []
  const from = dates[0]
  const to = dates[dates.length - 1]
  const periods = await loadPeriods(from, to)
  const allocations = periods.length
    ? await allocationQueries.findUserAllocationsByPeriods(userId, periods.map((entry) => entry.period._id))
    : []
  const catererByPeriod = new Map(
    allocations.filter((row) => row.catererId?._id).map((row) => [idOf(row.periodId), row.catererId])
  )
  const caterers = [...new Map([...catererByPeriod.values()].map((caterer) => [idOf(caterer), caterer])).values()]
  const [versionLists, overrides] = await Promise.all([
    Promise.all(caterers.map((caterer) => menuQueries.findWeeksForRange(caterer._id, from, to))),
    menuQueries.findDayOverrides(caterers.map((caterer) => caterer._id), dates),
  ])
  const versionsByCaterer = new Map(caterers.map((caterer, index) => [idOf(caterer), versionLists[index]]))
  const overrideByKey = new Map(overrides.map((doc) => [`${idOf(doc.catererId)}:${doc.date}`, doc]))

  return dates.map((date) => {
    const covering = coveringPeriods(periods, date)
    const allocated = covering.find((entry) => catererByPeriod.has(idOf(entry.period)))
    const period = (allocated || covering[0])?.period || null
    if (!period) {
      return { date, weekday: weekdayOf(date), isPast: date < today, isToday: date === today, caterer: null, periodId: null, meals: [] }
    }
    const caterer = allocated ? catererByPeriod.get(idOf(period)) : null
    return resolveMenuDay({
      date,
      today,
      caterer,
      period,
      versions: caterer ? versionsByCaterer.get(idOf(caterer)) : [],
      override: caterer ? overrideByKey.get(`${idOf(caterer)}:${date}`) || null : null,
    })
  })
}
