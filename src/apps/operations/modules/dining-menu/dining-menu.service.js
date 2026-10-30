/**
 * Dining Menu (Admin + Dining Office manage; caterers and students read)
 * Per-kitchen menus: a versioned weekly menu plus per-date, per-meal
 * overrides. Days before today are a record and cannot be edited; versions
 * and overrides reach at most 6 months ahead. Reads cover at most 62 days.
 *
 * Writes go through services/dining/menuOwner, reads through menuQueries;
 * day resolution lives in services/dining/menuResolve.
 */

import mongoose from "mongoose"
import { success, badRequest, notFound } from "../../../../services/base/index.js"
import { menuOwner } from "../../../../services/dining/menuOwner.service.js"
import { menuQueries } from "../../../../services/dining/menuQueries.service.js"
import { diningQueries } from "../../../../services/dining/diningQueries.service.js"
import {
  addMonthsKey, buildCatererMenuDays, buildStudentMenuDays, localKey, mealKey, rangeKeys, shiftKey,
} from "../../../../services/dining/menuResolve.js"

export const MAX_RANGE_DAYS = 62
const MONTHS_AHEAD = 6
const MAX_ITEMS = 40
const MAX_MEALS = 12
const MAX_TARGETS = 50
const DIETS = ["veg", "egg", "nonveg", ""]
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

const idOf = (value) => String(value?._id || value || "")
const isObjectId = (value) => typeof value === "string" && /^[a-f\d]{24}$/i.test(value) && mongoose.Types.ObjectId.isValid(value)

const isDayKey = (value) => {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31"
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Read range: ?from&to (YYYY-MM-DD). from defaults to today, to to from + 6.
 * Returns { dates } or { error }.
 */
export const parseRange = (query = {}, today = localKey()) => {
  for (const key of ["from", "to"]) {
    if (query[key] !== undefined && (typeof query[key] !== "string" || !isDayKey(query[key]))) {
      return { error: badRequest(`${key} must be a valid YYYY-MM-DD date`) }
    }
  }
  const from = query.from || today
  const to = query.to || shiftKey(from, 6)
  if (from > to) return { error: badRequest("from must be on or before to") }
  if (to > shiftKey(from, MAX_RANGE_DAYS - 1)) return { error: badRequest(`Date range must not exceed ${MAX_RANGE_DAYS} days`) }
  return { dates: rangeKeys(from, to) }
}

/** An editable day: today .. today + 6 months. Returns an error message or null. */
const editableDayError = (key, today, label) => {
  if (!isDayKey(key)) return `${label} must be a valid YYYY-MM-DD date`
  if (key < today) return `${label} is in the past; past menus cannot be changed`
  if (key > addMonthsKey(today, MONTHS_AHEAD)) return `${label} must be within ${MONTHS_AHEAD} months from today`
  return null
}

const parseItem = (item, where) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return { error: `${where}: each item must be an object` }
  const name = typeof item.name === "string" ? item.name.trim() : ""
  if (!name) return { error: `${where}: item name is required` }
  if (name.length > 80) return { error: `${where}: item names must be at most 80 characters` }
  const diet = item.diet === undefined || item.diet === null ? "" : item.diet
  if (!DIETS.includes(diet)) return { error: `${where}: diet must be veg, egg, nonveg or empty` }
  if (item.special !== undefined && typeof item.special !== "boolean") return { error: `${where}: special must be true or false` }
  return { item: { name, diet, special: Boolean(item.special) } }
}

/** [{ name, items, note }] -> normalized meals, or { error }. Names must be unique. */
const parseMeals = (meals, where = "Meals") => {
  if (!Array.isArray(meals)) return { error: `${where} must be an array` }
  if (meals.length > MAX_MEALS) return { error: `${where}: at most ${MAX_MEALS} meals` }
  const seen = new Set()
  const result = []
  for (const meal of meals) {
    if (!meal || typeof meal !== "object" || Array.isArray(meal)) return { error: `${where}: each meal must be an object` }
    const name = typeof meal.name === "string" ? meal.name.trim() : ""
    if (!name) return { error: `${where}: meal name is required` }
    if (name.length > 60) return { error: `${where}: meal names must be at most 60 characters` }
    if (seen.has(mealKey(name))) return { error: `${where}: meal "${name}" is listed twice` }
    seen.add(mealKey(name))
    const items = meal.items === undefined ? [] : meal.items
    if (!Array.isArray(items)) return { error: `${name}: items must be an array` }
    if (items.length > MAX_ITEMS) return { error: `${name}: at most ${MAX_ITEMS} items` }
    const parsed = []
    for (const raw of items) {
      const { item, error } = parseItem(raw, name)
      if (error) return { error }
      parsed.push(item)
    }
    const note = meal.note === undefined || meal.note === null ? "" : meal.note
    if (typeof note !== "string") return { error: `${name}: note must be text` }
    if (note.trim().length > 200) return { error: `${name}: note must be at most 200 characters` }
    result.push({ name, items: parsed, note: note.trim() })
  }
  return { meals: result }
}

/** Weekly days [{ weekday, meals }] -> normalized, sorted by weekday, or { error }. */
const parseDays = (days) => {
  if (!Array.isArray(days)) return { error: "days must be an array" }
  const seen = new Set()
  const result = []
  for (const day of days) {
    const weekday = day?.weekday
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: "weekday must be an integer from 0 (Sunday) to 6" }
    if (seen.has(weekday)) return { error: `weekday ${weekday} is listed twice` }
    seen.add(weekday)
    const { meals, error } = parseMeals(day.meals ?? [], `Weekday ${weekday}`)
    if (error) return { error }
    result.push({ weekday, meals })
  }
  return { days: result.sort((a, b) => a.weekday - b.weekday) }
}

const parseNote = (note) => {
  if (note === undefined || note === null) return { note: "" }
  if (typeof note !== "string") return { error: "note must be text" }
  if (note.trim().length > 200) return { error: "note must be at most 200 characters" }
  return { note: note.trim() }
}

/** Dates list (1..62, unique, editable). Returns { dates } ascending or { error }. */
const parseEditableDates = (dates, today) => {
  if (!Array.isArray(dates) || !dates.length) return { error: "dates must be a non-empty array" }
  if (dates.length > MAX_RANGE_DAYS) return { error: `At most ${MAX_RANGE_DAYS} dates at once` }
  for (const date of dates) {
    const error = editableDayError(date, today, `Date ${typeof date === "string" ? date : ""}`.trim())
    if (error) return { error }
  }
  return { dates: [...new Set(dates)].sort() }
}

const loadCaterer = async (catererId, label = "catererId") => {
  if (!isObjectId(catererId)) return { error: badRequest(`${label} must be a valid ObjectId`) }
  const caterer = await diningQueries.findCatererById(catererId, { lean: true })
  if (!caterer) return { error: notFound("Caterer") }
  return { caterer }
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

const serializeMeal = (meal) => ({
  name: meal.name,
  items: (meal.items || []).map((item) => ({ name: item.name, diet: item.diet || "", special: Boolean(item.special) })),
  note: meal.note || "",
})

const serializeVersion = (version, { today, currentFrom }) => ({
  effectiveFrom: version.effectiveFrom,
  days: [...(version.days || [])]
    .sort((a, b) => a.weekday - b.weekday)
    .map((day) => ({ weekday: day.weekday, meals: (day.meals || []).map(serializeMeal) })),
  note: version.note || "",
  updatedAt: version.updatedAt || null,
  updatedBy: version.updatedBy?._id ? { id: idOf(version.updatedBy), name: version.updatedBy.name || "" } : null,
  isCurrent: version.effectiveFrom === currentFrom,
  isScheduled: version.effectiveFrom > today,
})

// ---------------------------------------------------------------------------
// Manage (Admin + Dining Office)
// ---------------------------------------------------------------------------

export const listMenuCaterers = async () => {
  const caterers = await diningQueries.findCaterers({}, { lean: true, select: "name isArchived" })
  const rows = caterers
    .map((caterer) => ({ id: idOf(caterer), name: caterer.name, isActive: !caterer.isArchived }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
  return success({ caterers: rows })
}

export const getMenu = async ({ query }) => {
  const today = localKey()
  const { caterer, error } = await loadCaterer(query.catererId)
  if (error) return error
  const range = parseRange(query, today)
  if (range.error) return range.error
  const days = await buildCatererMenuDays({ caterer, dates: range.dates, today })
  return success({ caterer: { id: idOf(caterer), name: caterer.name }, today, days })
}

export const listVersions = async ({ query }) => {
  const today = localKey()
  const { caterer, error } = await loadCaterer(query.catererId)
  if (error) return error
  const versions = await menuQueries.findWeekVersions(caterer._id)
  const currentFrom = versions.find((version) => version.effectiveFrom <= today)?.effectiveFrom || null
  return success({ versions: versions.map((version) => serializeVersion(version, { today, currentFrom })) })
}

const versionResponse = async (catererId, effectiveFrom, today) => {
  const [version, current] = await Promise.all([
    menuQueries.findWeekVersion(catererId, effectiveFrom),
    menuQueries.findWeekInEffect(catererId, today),
  ])
  return serializeVersion(version, { today, currentFrom: current?.effectiveFrom || null })
}

export const saveWeek = async ({ user, body = {} }) => {
  const today = localKey()
  const { caterer, error } = await loadCaterer(body.catererId)
  if (error) return error
  const dateError = editableDayError(body.effectiveFrom, today, "effectiveFrom")
  if (dateError) return badRequest(dateError)
  const parsedDays = parseDays(body.days)
  if (parsedDays.error) return badRequest(parsedDays.error)
  const parsedNote = parseNote(body.note)
  if (parsedNote.error) return badRequest(parsedNote.error)
  await menuOwner.upsertWeek({
    catererId: caterer._id, effectiveFrom: body.effectiveFrom, days: parsedDays.days, note: parsedNote.note, actorId: user?._id || null,
  })
  return success({ version: await versionResponse(caterer._id, body.effectiveFrom, today) }, 200, "Weekly menu saved")
}

export const deleteWeek = async ({ query }) => {
  const today = localKey()
  const { caterer, error } = await loadCaterer(query.catererId)
  if (error) return error
  if (!isDayKey(query.effectiveFrom)) return badRequest("effectiveFrom must be a valid YYYY-MM-DD date")
  if (query.effectiveFrom <= today) return badRequest("Only scheduled versions (starting after today) can be deleted")
  const deleted = await menuOwner.deleteWeek(caterer._id, query.effectiveFrom)
  if (!deleted) return notFound("Menu version")
  return success({ deleted: true }, 200, "Scheduled menu deleted")
}

export const saveDates = async ({ user, body = {} }) => {
  const today = localKey()
  const { caterer, error } = await loadCaterer(body.catererId)
  if (error) return error
  const parsedDates = parseEditableDates(body.dates, today)
  if (parsedDates.error) return badRequest(parsedDates.error)
  const parsedMeals = parseMeals(body.meals)
  if (parsedMeals.error) return badRequest(parsedMeals.error)
  if (!parsedMeals.meals.length) return badRequest("meals must list at least one meal")
  await menuOwner.setDateMeals({ catererId: caterer._id, dates: parsedDates.dates, meals: parsedMeals.meals, actorId: user?._id || null })
  const days = await buildCatererMenuDays({ caterer, dates: parsedDates.dates, today })
  return success({ days }, 200, "Menu updated")
}

export const resetDates = async ({ user, body = {} }) => {
  const today = localKey()
  const { caterer, error } = await loadCaterer(body.catererId)
  if (error) return error
  const parsedDates = parseEditableDates(body.dates, today)
  if (parsedDates.error) return badRequest(parsedDates.error)
  let mealNames = null
  if (body.mealNames !== undefined && body.mealNames !== null) {
    if (!Array.isArray(body.mealNames) || !body.mealNames.length || body.mealNames.some((name) => typeof name !== "string" || !name.trim())) {
      return badRequest("mealNames must be a non-empty array of meal names")
    }
    mealNames = body.mealNames.map((name) => name.trim())
  }
  await menuOwner.removeDateMeals({ catererId: caterer._id, dates: parsedDates.dates, mealNames, actorId: user?._id || null })
  const days = await buildCatererMenuDays({ caterer, dates: parsedDates.dates, today })
  return success({ days }, 200, "Menu reset to the weekly menu")
}

export const copyMenu = async ({ user, body = {} }) => {
  const today = localKey()
  const source = await loadCaterer(body.fromCatererId, "fromCatererId")
  if (source.error) return source.error
  if (!Array.isArray(body.toCatererIds) || !body.toCatererIds.length) return badRequest("toCatererIds must be a non-empty array")
  if (body.toCatererIds.length > MAX_TARGETS) return badRequest(`At most ${MAX_TARGETS} target kitchens`)
  if (body.toCatererIds.some((id) => !isObjectId(id))) return badRequest("toCatererIds must be valid ObjectIds")
  const dateError = editableDayError(body.effectiveFrom, today, "effectiveFrom")
  if (dateError) return badRequest(dateError)
  const targetIds = [...new Set(body.toCatererIds.map(String))].filter((id) => id !== idOf(source.caterer))
  if (!targetIds.length) return badRequest("Pick at least one other kitchen to copy to")
  const targets = await diningQueries.findCaterers({ _id: { $in: targetIds } }, { lean: true, select: "_id" })
  if (targets.length !== targetIds.length) return notFound("Caterer")
  const version = await menuQueries.findWeekInEffect(source.caterer._id, body.effectiveFrom)
  if (!version) return badRequest("The source kitchen has no weekly menu on that date")
  const days = (version.days || []).map((day) => ({ weekday: day.weekday, meals: (day.meals || []).map(serializeMeal) }))
  for (const target of targets) {
    await menuOwner.upsertWeek({
      catererId: target._id, effectiveFrom: body.effectiveFrom, days, note: version.note || "", actorId: user?._id || null,
    })
  }
  return success({ copied: targets.length }, 200, "Menu copied")
}

export const searchItems = async ({ query = {} }) => {
  if (query.q !== undefined && typeof query.q !== "string") return badRequest("q must be a single string")
  const q = (query.q || "").trim()
  if (q.length > 80) return badRequest("q must be at most 80 characters")
  let limit = 20
  if (query.limit !== undefined) {
    if (typeof query.limit !== "string" || !/^[1-9]\d*$/.test(query.limit) || Number(query.limit) > 50) {
      return badRequest("limit must be between 1 and 50")
    }
    limit = Number(query.limit)
  }
  const rows = await menuQueries.searchItems({ q, limit })
  const items = rows.map((row) => {
    // The remembered diet: the one used most, preferring a set diet over none.
    const diets = [...row.diets].sort((a, b) => Number(Boolean(b.diet)) - Number(Boolean(a.diet)) || b.uses - a.uses)
    return { name: row.name.trim(), diet: diets[0]?.diet || "", uses: row.uses }
  })
  return success({ items })
}

// ---------------------------------------------------------------------------
// Readers (caterer own kitchen, student)
// ---------------------------------------------------------------------------

/** The menu of the caterer's own kitchen. `caterer` is resolved by the caller. */
export const getCatererMenu = async ({ caterer, query }) => {
  const today = localKey()
  const range = parseRange(query, today)
  if (range.error) return range.error
  const days = await buildCatererMenuDays({ caterer, dates: range.dates, today })
  return success({ caterer: { id: idOf(caterer), name: caterer.name }, today, days })
}

/** A student's menu: each day from the caterer allocated in the period covering it. */
export const getStudentMenu = async ({ userId, query }) => {
  const today = localKey()
  const range = parseRange(query, today)
  if (range.error) return range.error
  const days = await buildStudentMenuDays({ userId, dates: range.dates, today })
  return success({ today, days })
}
