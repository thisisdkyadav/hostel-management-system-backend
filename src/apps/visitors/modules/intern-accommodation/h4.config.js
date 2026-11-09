import { getConfigWithDefault } from "../../../../utils/configDefaults.js"
import { normalizeH4PaymentLink } from "./h4.payment-link.js"

export const H4_LETTER_DEFAULTS = {
  occupancy: "double occupancy",
  roomFacilities: ["One Bed", "One Table", "One Chair", "One Mattress", "One Almirah"],
}

export const validateH4Config = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Intern accommodation settings must be an object" }
  const value = {}
  // One link for the combined accommodation + mess bill. Older saves stored it
  // as accommodationPaymentLink.
  value.paymentLink = normalizeH4PaymentLink(raw.paymentLink ?? raw.accommodationPaymentLink)
  if (value.paymentLink === null) return { error: "Enter a valid payment link" }
  for (const key of ["gstPercentage", "accommodationDailyRate", "messDailyRate"]) {
    const n = Number(raw[key] ?? 0)
    if (!Number.isFinite(n) || n < 0 || n > (key === "gstPercentage" ? 100 : 10000000))
      return { error: `Invalid ${key === "gstPercentage" ? "GST percentage" : "daily charge"}` }
    value[key] = Math.round(n * 100) / 100
  }
  // Wording of the student's charges letter, and the Chief Warden Office
  // contact printed in every student letter.
  const text = (v, max) => String(v ?? "").trim().slice(0, max)
  value.occupancy = text(raw.occupancy ?? H4_LETTER_DEFAULTS.occupancy, 60)
  const facilities = raw.roomFacilities ?? H4_LETTER_DEFAULTS.roomFacilities
  if (!Array.isArray(facilities)) return { error: "Room facilities must be a list" }
  value.roomFacilities = facilities.map((f) => text(f, 80)).filter(Boolean).slice(0, 20)
  value.contactEmail = text(raw.contactEmail, 120)
  if (value.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactEmail)) return { error: "Enter a valid contact email" }
  value.contactPhone = text(raw.contactPhone, 40)
  return { value }
}
export const getH4Config = async () => {
  const doc = await getConfigWithDefault("internAccommodation")
  const result = validateH4Config(doc?.value || {})
  if (result.error) throw new Error(result.error)
  return result.value
}
