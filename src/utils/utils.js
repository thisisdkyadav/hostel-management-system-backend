export const formatDate = (dateStr, inputFormat = "DD-MM-YYYY") => {
  if (!dateStr) return null

  let day, month, year

  switch (inputFormat) {
    case "DD-MM-YYYY":
      ;[day, month, year] = dateStr.split("-").map(Number)
      break
    case "MM-DD-YYYY":
      ;[month, day, year] = dateStr.split("-").map(Number)
      break
    case "YYYY-MM-DD":
      ;[year, month, day] = dateStr.split("-").map(Number)
      break
    case "DD/MM/YYYY":
      ;[day, month, year] = dateStr.split("/").map(Number)
      break
    case "MM/DD/YYYY":
      ;[month, day, year] = dateStr.split("/").map(Number)
      break
    case "YYYY/MM/DD":
      ;[year, month, day] = dateStr.split("/").map(Number)
      break
    default:
      // Default to DD-MM-YYYY if format not recognized
      ;[day, month, year] = dateStr.split("-").map(Number)
  }
  const newDate = year && month && day ? new Date(year, month - 1, day) : null
  return newDate
}

/**
 * Normalize any date-ish input to a date-only "YYYY-MM-DD" string.
 *
 * Pure string/component math — never constructs a local-timezone Date, so an
 * inbound "YYYY-MM-DD" passes through untouched and no day-shift can occur.
 * Used for date-only fields (student dateOfBirth / admissionDate) on both the
 * write path and the read path (tolerant of legacy Date values during rollout).
 *
 * - ""            -> "" (allow clearing a value)
 * - null/undefined -> undefined
 * - Date           -> UTC calendar date (input.toISOString slice)
 * - "YYYY-MM-DD"   -> unchanged
 * - ISO timestamp  -> date portion
 * - "DD-MM-YYYY" / "DD/MM/YYYY" -> "YYYY-MM-DD"
 * - anything else  -> undefined (let validation reject it)
 */
export const toDateOnly = (input) => {
  if (input === "") return ""
  if (input == null) return undefined
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? undefined : input.toISOString().slice(0, 10)
  }
  const s = String(input).trim()
  if (s === "") return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return undefined
}
