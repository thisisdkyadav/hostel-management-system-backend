import { getConfigWithDefault } from "../../../../utils/configDefaults.js"
import { normalizeH4PaymentLink } from "./h4.payment-link.js"

export const validateH4Config = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Intern accommodation settings must be an object" }
  const value = {}
  for (const key of ["accommodationPaymentLink", "messPaymentLink"]) {
    value[key] = normalizeH4PaymentLink(raw[key])
    if (value[key] === null) return { error: "Enter valid payment links" }
  }
  for (const key of ["gstPercentage", "accommodationDailyRate", "messDailyRate"]) {
    const n = Number(raw[key] ?? 0)
    if (!Number.isFinite(n) || n < 0 || n > (key === "gstPercentage" ? 100 : 10000000))
      return { error: `Invalid ${key === "gstPercentage" ? "GST percentage" : "daily charge"}` }
    value[key] = Math.round(n * 100) / 100
  }
  return { value }
}
export const getH4Config = async () => {
  const doc = await getConfigWithDefault("internAccommodation")
  const result = validateH4Config(doc?.value || {})
  if (result.error) throw new Error(result.error)
  return result.value
}
