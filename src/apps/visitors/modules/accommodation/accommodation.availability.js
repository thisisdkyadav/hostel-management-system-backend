/**
 * Guest-room availability.
 *
 * Guest inventory is DYNAMIC: any fully-empty Active room (status "Active",
 * occupancy 0 — no students living there) can host guests. When the supervisor
 * assigns a room to a booking it is flipped to status "Guest" (held); the
 * nightly invoice sweep flips it back to "Active". Nothing is marked "Guest"
 * manually anymore.
 *
 * A room's bookable bed count is its live capacity when Active, or the preserved
 * `originalCapacity` once it has been flipped to "Guest" (capacity is zeroed by
 * the room-status machinery on deactivation).
 */

import { Room, AccommodationRequest, Hostel, ACCOMMODATION_STATUS } from "../../../../models/index.js"

const S = ACCOMMODATION_STATUS

const bedCount = (room) => room.originalCapacity || room.capacity || 0

// Half-open overlap: [aFrom, aTo) intersects [bFrom, bTo) iff aFrom < bTo && bFrom < aTo.
const overlapFilter = (from, to) => ({
  "stay.fromDate": { $lt: new Date(to) },
  "stay.toDate": { $gt: new Date(from) },
})

// Fully-empty, Active rooms — the guest-eligible pool for a hostel.
const emptyActiveRoomFilter = (hostelId) => ({ hostelId, status: "Active", occupancy: 0 })

// Hostel-level headroom (CW Office allotment view).
export const getHostelGuestAvailability = async ({ hostelId, from, to, excludeRequestId } = {}) => {
  const emptyRooms = await Room.find(emptyActiveRoomFilter(hostelId)).lean()
  const totalBeds = emptyRooms.reduce((sum, room) => sum + bedCount(room), 0)

  // Bookings already allotted here but not yet room-assigned still have a claim on
  // the empty pool (their rooms aren't flipped to "Guest" until assignment). Once
  // assigned, those rooms leave the Active-empty pool on their own.
  const filter = {
    "allotment.hostelId": hostelId,
    status: S.HOSTEL_ALLOTTED,
    ...overlapFilter(from, to),
  }
  if (excludeRequestId) filter._id = { $ne: excludeRequestId }

  const pending = await AccommodationRequest.find(filter).select("persons").lean()
  const committed = pending.reduce((sum, req) => sum + (req.persons || 0), 0)

  return {
    hostelId,
    roomCount: emptyRooms.length,
    totalBeds,
    committed,
    available: Math.max(0, totalBeds - committed),
  }
}

// Availability across every hostel that currently has empty Active rooms.
export const listHostelsGuestAvailability = async ({ from, to, excludeRequestId } = {}) => {
  const hostelIds = await Room.distinct("hostelId", { status: "Active", occupancy: 0 })
  const hostels = await Hostel.find({ _id: { $in: hostelIds } }).select("name type gender").lean()

  const results = []
  for (const hostel of hostels) {
    const availability = await getHostelGuestAvailability({ hostelId: hostel._id, from, to, excludeRequestId })
    results.push({ hostelId: hostel._id, name: hostel.name, type: hostel.type, gender: hostel.gender, ...availability })
  }
  return results
}

// Per-room list for the Supervisor: fully-empty Active rooms in the hostel, plus
// the rooms this booking already holds (now status "Guest") so they show up for
// reassignment. `includeRoomIds` are the current request's assigned room ids.
export const getGuestRoomAvailability = async ({ hostelId, includeRoomIds = [] } = {}) => {
  const filter = includeRoomIds.length
    ? { $or: [emptyActiveRoomFilter(hostelId), { _id: { $in: includeRoomIds } }] }
    : emptyActiveRoomFilter(hostelId)

  const rooms = await Room.find(filter).populate("unitId", "unitNumber").lean()

  return rooms.map((room) => {
    const beds = bedCount(room)
    return {
      roomId: room._id,
      roomNumber: room.roomNumber,
      unitNumber: room.unitId?.unitNumber || null,
      beds,
      used: 0,
      available: beds,
    }
  })
}
