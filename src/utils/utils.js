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
