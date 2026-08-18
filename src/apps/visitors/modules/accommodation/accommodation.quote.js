/**
 * Accommodation charge / quote helpers.
 *
 * Amounts are set manually by Chief Warden Office (per guest price + GST), not
 * auto-calculated from nights × tariff. Config holds three price presets and
 * three GST % presets that the office can pick from (or override).
 */

import { getConfigWithDefault } from "../../../../utils/configDefaults.js"

const DAY_MS = 24 * 60 * 60 * 1000
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const computeNights = (fromDate, toDate) => {
  if (!fromDate || !toDate) return 0
  const diff = Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / DAY_MS)
  return Math.max(1, diff)
}

/** Flatten + migrate legacy single-fee config into the 3-slot presets. */
export const normalizeAccommodationConfig = (raw = {}) => {
  const pricePerPerson1 = Number(raw.pricePerPerson1)
  const pricePerPerson2 = Number(raw.pricePerPerson2)
  const pricePerPerson3 = Number(raw.pricePerPerson3)
  const gstPercentage1 = Number(raw.gstPercentage1)
  const gstPercentage2 = Number(raw.gstPercentage2)
  const gstPercentage3 = Number(raw.gstPercentage3)

  const hasAnyPrice =
    (Number.isFinite(pricePerPerson1) && pricePerPerson1 > 0) ||
    (Number.isFinite(pricePerPerson2) && pricePerPerson2 > 0) ||
    (Number.isFinite(pricePerPerson3) && pricePerPerson3 > 0)
  const hasAnyGst =
    (Number.isFinite(gstPercentage1) && gstPercentage1 > 0) ||
    (Number.isFinite(gstPercentage2) && gstPercentage2 > 0) ||
    (Number.isFinite(gstPercentage3) && gstPercentage3 > 0)

  return {
    defaultPaymentQR: String(raw.defaultPaymentQR || ""),
    pricePerPerson1: hasAnyPrice ? pricePerPerson1 || 0 : Number(raw.feePerPersonPerNight) || 0,
    pricePerPerson2: hasAnyPrice ? pricePerPerson2 || 0 : 0,
    pricePerPerson3: hasAnyPrice ? pricePerPerson3 || 0 : 0,
    // Keep 0 as a valid preset; only migrate legacy when no new keys were set at all.
    gstPercentage1: Number.isFinite(gstPercentage1)
      ? gstPercentage1
      : hasAnyGst
        ? 0
        : Number(raw.gstPercentage) || 0,
    gstPercentage2: Number.isFinite(gstPercentage2) ? gstPercentage2 : 0,
    gstPercentage3: Number.isFinite(gstPercentage3) ? gstPercentage3 : 0,
    gstin: String(raw.gstin || ""),
  }
}

export const getAccommodationConfig = async () => {
  const doc = await getConfigWithDefault("accommodation")
  return normalizeAccommodationConfig(doc?.value || {})
}

/** Positive price presets from config (zeros omitted so buttons stay useful). */
export const priceOptionsFromConfig = (config = {}) =>
  [config.pricePerPerson1, config.pricePerPerson2, config.pricePerPerson3]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0)
    .filter((n, i, arr) => arr.indexOf(n) === i)

/** GST % presets (0 is kept when configured; de-duplicated). */
export const gstOptionsFromConfig = (config = {}) =>
  [config.gstPercentage1, config.gstPercentage2, config.gstPercentage3]
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n >= 0)
    .filter((n, i, arr) => arr.indexOf(n) === i)

/** Placeholder quote before the office sets charges. */
export const emptyQuote = ({ persons = 0, nights = 0 } = {}) => ({
  persons: Number(persons) || 0,
  nights: Number(nights) || 0,
  feePerPersonPerNight: 0,
  subtotal: 0,
  gstPercentage: 0,
  gstAmount: 0,
  total: 0,
  guestCharges: [],
})

/**
 * Build the request quote from per-guest price + GST chosen by CWO.
 * `guestCharges` items: { guestIndex, price, gstPercentage }
 */
export const buildQuoteFromGuestCharges = ({ guests = [], nights = 0, guestCharges = [] } = {}) => {
  const list = Array.isArray(guests) ? guests : []
  const p = list.length
  const n = Number(nights) || 0
  const byIndex = new Map(
    (Array.isArray(guestCharges) ? guestCharges : []).map((c) => [Number(c.guestIndex), c])
  )

  const lines = list.map((guest, i) => {
    const raw = byIndex.get(i) || {}
    const price = round2(raw.price)
    const gstPercentage = round2(raw.gstPercentage)
    if (!(price > 0)) {
      return { error: `Price is required for guest ${i + 1} (${guest?.name || "unnamed"})` }
    }
    if (!Number.isFinite(gstPercentage) || gstPercentage < 0) {
      return { error: `GST % is invalid for guest ${i + 1} (${guest?.name || "unnamed"})` }
    }
    const subtotal = price
    const gstAmount = round2((subtotal * gstPercentage) / 100)
    return {
      guestIndex: i,
      guestName: String(guest?.name || "").trim(),
      price,
      gstPercentage,
      subtotal,
      gstAmount,
      total: round2(subtotal + gstAmount),
    }
  })

  const firstError = lines.find((l) => l.error)
  if (firstError) return { error: firstError.error }

  const subtotal = round2(lines.reduce((s, l) => s + l.subtotal, 0))
  const gstAmount = round2(lines.reduce((s, l) => s + l.gstAmount, 0))
  const total = round2(subtotal + gstAmount)
  // Invoice sheet still shows a single tariff column — use the first guest's
  // price as a simple reference when they all match, else the average.
  const prices = lines.map((l) => l.price)
  const samePrice = prices.every((x) => x === prices[0])
  const feePerPersonPerNight = samePrice ? prices[0] || 0 : round2(prices.reduce((s, x) => s + x, 0) / (prices.length || 1))
  const gstPcts = lines.map((l) => l.gstPercentage)
  const sameGst = gstPcts.every((x) => x === gstPcts[0])
  const gstPercentage = sameGst ? gstPcts[0] || 0 : 0

  return {
    persons: p,
    nights: n,
    feePerPersonPerNight,
    subtotal,
    gstPercentage,
    gstAmount,
    total,
    guestCharges: lines,
  }
}

/**
 * @deprecated Amounts are no longer auto-calculated. Kept for older callers;
 * returns an empty (zero) quote with person/night counts only.
 */
export const buildQuote = ({ persons, nights }) => emptyQuote({ persons, nights })
