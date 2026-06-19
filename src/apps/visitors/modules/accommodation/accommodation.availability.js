/**
 * Guest-room availability.
 *
 * Guest inventory = rooms with status "Guest". A room's bookable bed count is its
 * preserved capacity (`originalCapacity` when it was deactivated, else `capacity`).
 * Guest occupancy is temporal (per stay window) and computed from overlapping
 * accommodation requests — Room.occupancy is left untouched (that's for students).
 */

import { Room, AccommodationRequest, Hostel, ACCOMMODATION_STATUS } from "../../../../models/index.js"

const S = ACCOMMODATION_STATUS

// Statuses that hold a guest bed during the stay window.
export const OCCUPYING_STATUSES = [S.HOSTEL_ALLOTTED, S.ROOMS_ASSIGNED, S.CHECKED_IN]

const bedCount = (room) => room.originalCapacity || room.capacity || 0

// Half-open overlap: [aFrom, aTo) intersects [bFrom, bTo) iff aFrom < bTo && bFrom < aTo.
const overlapFilter = (from, to) => ({
  "stay.fromDate": { $lt: new Date(to) },
  "stay.toDate": { $gt: new Date(from) },
})

// Hostel-level headroom (persons reserved by any allotted/occupying request).
export const getHostelGuestAvailability = async ({ hostelId, from, to, excludeRequestId } = {}) => {
  const guestRooms = await Room.find({ hostelId, status: "Guest" }).lean()
  const totalBeds = guestRooms.reduce((sum, room) => sum + bedCount(room), 0)

  const filter = {
    "allotment.hostelId": hostelId,
    status: { $in: OCCUPYING_STATUSES },
    ...overlapFilter(from, to),
  }
  if (excludeRequestId) filter._id = { $ne: excludeRequestId }

  const overlapping = await AccommodationRequest.find(filter).select("persons").lean()
  const committed = overlapping.reduce((sum, req) => sum + (req.persons || 0), 0)

  return {
    hostelId,
    roomCount: guestRooms.length,
    totalBeds,
    committed,
    available: Math.max(0, totalBeds - committed),
  }
}

// Availability across every hostel that has guest rooms (CW Office allotment view).
export const listHostelsGuestAvailability = async ({ from, to, excludeRequestId } = {}) => {
  const guestRooms = await Room.find({ status: "Guest" }).select("hostelId").lean()
  const hostelIds = [...new Set(guestRooms.map((room) => String(room.hostelId)))]
  const hostels = await Hostel.find({ _id: { $in: hostelIds } }).select("name type gender").lean()

  const results = []
  for (const hostel of hostels) {
    const availability = await getHostelGuestAvailability({ hostelId: hostel._id, from, to, excludeRequestId })
    results.push({ hostelId: hostel._id, name: hostel.name, type: hostel.type, gender: hostel.gender, ...availability })
  }
  return results
}

// Per-room free beds within a hostel for the window (Supervisor assignment view).
// Only assigned requests (ROOMS_ASSIGNED / CHECKED_IN) consume specific rooms.
export const getGuestRoomAvailability = async ({ hostelId, from, to, excludeRequestId } = {}) => {
  const guestRooms = await Room.find({ hostelId, status: "Guest" })
    .populate("unitId", "unitNumber")
    .lean()
  const roomIds = guestRooms.map((room) => room._id)

  const filter = {
    status: { $in: [S.ROOMS_ASSIGNED, S.CHECKED_IN] },
    "rooms.roomId": { $in: roomIds },
    ...overlapFilter(from, to),
  }
  if (excludeRequestId) filter._id = { $ne: excludeRequestId }

  const overlapping = await AccommodationRequest.find(filter).select("rooms").lean()
  const usedByRoom = {}
  for (const req of overlapping) {
    for (const assignment of req.rooms || []) {
      const rid = String(assignment.roomId)
      usedByRoom[rid] = (usedByRoom[rid] || 0) + (assignment.guestIndexes?.length || 0)
    }
  }

  return guestRooms.map((room) => {
    const beds = bedCount(room)
    const used = usedByRoom[String(room._id)] || 0
    return {
      roomId: room._id,
      roomNumber: room.roomNumber,
      unitNumber: room.unitId?.unitNumber || null,
      beds,
      used,
      available: Math.max(0, beds - used),
    }
  })
}
