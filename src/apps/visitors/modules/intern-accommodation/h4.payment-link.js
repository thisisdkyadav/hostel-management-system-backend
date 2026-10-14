export const normalizeH4PaymentLink = (value) => {
  const text = String(value ?? "").trim()
  if (!text) return ""
  if (text.length > 2048) return null
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(candidate)
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password)
      return null
    return url.href
  } catch {
    return null
  }
}
