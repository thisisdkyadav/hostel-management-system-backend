/**
 * Accommodation charge / quote computation.
 * Reads the `accommodation` settings config; an AccommodationType may override
 * the per-person-per-night fee and GST percentage.
 */

import { getConfigWithDefault } from "../../../../utils/configDefaults.js"

const DAY_MS = 24 * 60 * 60 * 1000
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const computeNights = (fromDate, toDate) => {
  if (!fromDate || !toDate) return 0
  const diff = Math.round((new Date(toDate).getTime() - new Date(fromDate).getTime()) / DAY_MS)
  return Math.max(1, diff)
}

export const getAccommodationConfig = async () => {
  const doc = await getConfigWithDefault("accommodation")
  return doc?.value || {}
}

// Type override wins; null/undefined falls back to the global config value.
const resolve = (typeVal, configVal) =>
  typeVal === null || typeVal === undefined ? Number(configVal) || 0 : Number(typeVal) || 0

export const buildQuote = ({ type, config, persons, nights }) => {
  const feePerPersonPerNight = resolve(type?.feePerPersonPerNight, config?.feePerPersonPerNight)
  const gstPercentage = resolve(type?.gstPercentage, config?.gstPercentage)
  const p = Number(persons) || 0
  const n = Number(nights) || 0
  const subtotal = round2(p * n * feePerPersonPerNight)
  const gstAmount = round2((subtotal * gstPercentage) / 100)
  const total = round2(subtotal + gstAmount)
  return { persons: p, nights: n, feePerPersonPerNight, subtotal, gstPercentage, gstAmount, total }
}
