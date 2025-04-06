export const formatDate = (dateStr) => {
  const [day, month, year] = dateStr ? dateStr.split("-").map(Number) : [null, null, null]
  const newDate = year && month && day ? new Date(year, month - 1, day) : null
  return newDate
}
