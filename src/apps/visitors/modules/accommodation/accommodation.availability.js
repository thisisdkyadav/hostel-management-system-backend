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

import { hostelQueries } from "../../../../services/hostel/hostelQueries.service.js"
import { accommodationQueries } from "../../../../services/accommodation/accommodationQueries.service.js"
import { personsAllottedToHostel } from "./accommodation.allotment.js"

const bedCount = (room) => room.originalCapacity || room.capacity || 0

/**
 * Hostel-level headroom (CW Office capacity + allotment view).
 *
 * Rooms are booked whole — a party gets a room to itself rather than a bed in a
 * shared one — so the ROOM count, not the bed count, is what limits how many
 * bookings a hostel can take. Beds are still reported, because a party has to
 * fit inside the rooms it is given.
 */
export const getHostelGuestAvailability = async ({ hostelId, from, to, excludeRequestId } = {}) => {
  const emptyRooms = await hostelQueries.findEmptyActiveRooms(hostelId)
  const totalBeds = emptyRooms.reduce((sum, room) => sum + bedCount(room), 0)
  const largestRoom = emptyRooms.reduce((max, room) => Math.max(max, bedCount(room)), 0)

  // Bookings already allotted here but not yet room-assigned still have a claim on
  // the empty pool (their rooms aren't flipped to "Guest" until assignment). Once
  // assigned, those rooms leave the Active-empty pool on their own.
  const pending = await accommodationQueries.findOverlappingAllotted({
    hostelId,
    from,
    to,
    excludeRequestId,
  })
  const committedBeds = pending.reduce((sum, req) => sum + personsAllottedToHostel(req, hostelId), 0)
  const committedRooms = pending.reduce(
    (sum, req) => sum + roomsNeededFor(personsAllottedToHostel(req, hostelId), largestRoom),
    0
  )

  const availableRooms = Math.max(0, emptyRooms.length - committedRooms)
  return {
    hostelId,
    roomCount: emptyRooms.length,
    totalBeds,
    largestRoom,
    committed: committedBeds,
    committedRooms,
    availableRooms,
    // Beds a new party could actually occupy, capped by the rooms left for it.
    available: Math.max(0, Math.min(totalBeds - committedBeds, availableRooms * largestRoom)),
  }
}

/** Whole rooms a party of `persons` needs, given the largest room on offer. */
export const roomsNeededFor = (persons, largestRoom) => {
  const party = Math.max(1, Number(persons) || 0)
  const capacity = Math.max(1, Number(largestRoom) || 1)
  return Math.ceil(party / capacity)
}

// Availability across every hostel that currently has empty Active rooms.
export const listHostelsGuestAvailability = async ({ from, to, excludeRequestId } = {}) => {
  const hostelIds = await hostelQueries.distinctHostelIdsWithEmptyActiveRooms()
  const hostels = await hostelQueries.findHostelsByIds(hostelIds, "name type gender isArchived")

  const results = []
  for (const hostel of hostels) {
    if (hostel.isArchived) continue
    const availability = await getHostelGuestAvailability({ hostelId: hostel._id, from, to, excludeRequestId })
    results.push({ hostelId: hostel._id, name: hostel.name, type: hostel.type, gender: hostel.gender, ...availability })
  }
  return results
}

// Per-room list for the Supervisor: fully-empty Active rooms in the hostel, plus
// the rooms this booking already holds (now status "Guest") so they show up for
// reassignment. `includeRoomIds` are the current request's assigned room ids.
export const getGuestRoomAvailability = async ({ hostelId, includeRoomIds = [] } = {}) => {
  const rooms = await hostelQueries.findGuestEligibleRooms(hostelId, includeRoomIds)

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
