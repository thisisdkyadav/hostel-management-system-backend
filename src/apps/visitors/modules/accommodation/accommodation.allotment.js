/**
 * Per-guest hostel allotment helpers.
 *
 * A request may split visitors across hostels. `guestAllotments[]` is the
 * source of truth; `allotment.hostelId` is kept as the first hostel for
 * older readers. Requests issued before this change have only allotment.hostelId
 * (every guest in that one hostel).
 */

const idOf = (value) => {
  if (value == null) return ""
  if (typeof value === "object" && value._id) return String(value._id)
  return String(value)
}

export const uniqueAllottedHostelIds = (request) => {
  const fromGuests = (Array.isArray(request?.guestAllotments) ? request.guestAllotments : [])
    .map((a) => idOf(a.hostelId))
    .filter(Boolean)
  if (fromGuests.length) return [...new Set(fromGuests)]
  const legacy = idOf(request?.allotment?.hostelId)
  return legacy ? [legacy] : []
}

export const guestIndexesForHostel = (request, hostelId) => {
  const hid = idOf(hostelId)
  if (!hid) return []
  const allotments = Array.isArray(request?.guestAllotments) ? request.guestAllotments : []
  if (allotments.length > 0) {
    return allotments
      .filter((a) => idOf(a.hostelId) === hid)
      .map((a) => Number(a.guestIndex))
      .filter((n) => Number.isInteger(n) && n >= 0)
  }
  if (idOf(request?.allotment?.hostelId) === hid) {
    const n = Number(request?.persons) || (request?.guests?.length || 0)
    return Array.from({ length: n }, (_, i) => i)
  }
  return []
}

export const guestIndexesForHostels = (request, hostelIds = []) => {
  const set = new Set((hostelIds || []).map(idOf).filter(Boolean))
  if (!set.size) return []
  const allotments = Array.isArray(request?.guestAllotments) ? request.guestAllotments : []
  if (allotments.length > 0) {
    return allotments
      .filter((a) => set.has(idOf(a.hostelId)))
      .map((a) => Number(a.guestIndex))
      .filter((n) => Number.isInteger(n) && n >= 0)
  }
  if (set.has(idOf(request?.allotment?.hostelId))) {
    const n = Number(request?.persons) || (request?.guests?.length || 0)
    return Array.from({ length: n }, (_, i) => i)
  }
  return []
}

export const personsAllottedToHostel = (request, hostelId) =>
  guestIndexesForHostel(request, hostelId).length

export const assignedGuestIndexes = (request) => {
  const set = new Set()
  for (const row of Array.isArray(request?.rooms) ? request.rooms : []) {
    for (const i of row.guestIndexes || []) set.add(Number(i))
  }
  return set
}

export const supervisorRoomsPending = (request, hostelIds) => {
  const mine = guestIndexesForHostels(request, hostelIds)
  if (!mine.length) return false
  const assigned = assignedGuestIndexes(request)
  return mine.some((i) => !assigned.has(i))
}

export const countByHostelId = (allotments = []) => {
  const map = new Map()
  for (const a of allotments) {
    const hid = idOf(a.hostelId)
    if (!hid) continue
    map.set(hid, (map.get(hid) || 0) + 1)
  }
  return map
}

export const formatHostelNames = (names = []) => {
  const list = [...new Set((names || []).map((n) => String(n || "").trim()).filter(Boolean))]
  if (list.length === 0) return ""
  if (list.length === 1) return list[0]
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`
}

export const hostelFilterForSupervisor = (hostelIds) => {
  const ids = (hostelIds || []).filter(Boolean)
  if (!ids.length) return { _id: { $in: [] } }
  return {
    $or: [{ "guestAllotments.hostelId": { $in: ids } }, { "allotment.hostelId": { $in: ids } }],
  }
}

export default {
  uniqueAllottedHostelIds,
  guestIndexesForHostel,
  guestIndexesForHostels,
  personsAllottedToHostel,
  assignedGuestIndexes,
  supervisorRoomsPending,
  countByHostelId,
  formatHostelNames,
  hostelFilterForSupervisor,
}
