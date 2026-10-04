import crypto from "node:crypto"
import { hostelQueries } from "../../../../services/hostel/hostelQueries.service.js"
import { visitorQueries } from "../../../../services/visitor/visitorQueries.service.js"
import { accommodationQueries as queries } from "../../../../services/accommodation/accommodationQueries.service.js"
import { accommodationOwner as owner } from "../../../../services/accommodation/accommodationOwner.service.js"
import { success, badRequest, forbidden, conflict, notFound } from "../../../../services/base/index.js"
import {
  S,
  validId,
  hostelScope,
  canRead,
  isOffice,
  isChief,
  paid,
  mutate,
  audit,
  clean,
  freshUser,
} from "./h4.helpers.js"
import { getStayWindow } from "../accommodation/accommodation.stay.js"

export const reservationPeriod = getStayWindow
export const inspectRoom = async (r, body, u, { session, stay = r.stay } = {}) => {
  const hostelId = String(body.hostelId || r.allotment?.hostelId || "")
  if (!validId(hostelId) || hostelId !== String(r.allotment?.hostelId)) return forbidden("Use the allotted hostel")
  if (!(isOffice(u) || isChief(u)) && !(await hostelScope(u)).includes(hostelId))
    return forbidden("This hostel is outside your scope")
  const hostel = await hostelQueries.findHostelById(hostelId, { session })
  if (!hostel || hostel.isArchived) return badRequest("The allotted hostel is unavailable")
  let unitId
  if (clean(body.unitNumber)) {
    const unit = await hostelQueries.findUnitByNumber(hostelId, clean(body.unitNumber), { session })
    if (!unit) return notFound("Unit")
    unitId = unit._id
  }
  if (!clean(body.roomNumber)) return badRequest("Enter a room number")
  const rooms = await hostelQueries.findH4RoomCandidates(hostelId, clean(body.roomNumber), unitId, { session })
  if (!rooms.length) return notFound("Room")
  if (rooms.length > 1) return badRequest("This number exists in multiple units. Enter the unit number.")
  const room = rooms[0]
  const { from, to } = reservationPeriod(stay)
  // Sequential reads: MongoDB transaction sessions cannot run parallel operations.
  const residents = await hostelQueries.findAllocationsForRoom(room._id, { session })
  const overlaps = (window) => window.from < to && window.to > from
  const h2 = (
    await queries.findRoomBookings({
      roomId: room._id,
      from: stay.fromDate,
      to: stay.toDate,
      excludeRequestId: r._id,
      session,
    })
  ).filter((b) => overlaps(getStayWindow(b.stay)))
  const legacy = (
    await visitorQueries.findRoomBookings({ roomId: room._id, from: stay.fromDate, to: stay.toDate, session })
  ).filter((b) => overlaps(getStayWindow({ fromDate: b.fromDate, toDate: b.toDate })))
  const interns = await queries.findReservations({ roomIds: [room._id], from, to, excludeRequestId: r._id, session })
  const warnings = []
  for (const a of residents)
    warnings.push({
      kind: "resident",
      id: String(a._id),
      name: a.userId?.name || "Resident student",
      rollNumber: a.studentProfileId?.rollNumber || "",
      message: "Currently assigned; physical presence during this stay is unknown.",
    })
  if (!residents.length && room.occupancy > 0)
    warnings.push({
      kind: "resident",
      id: "occupancy",
      message: `${room.occupancy} resident(s) recorded; physical presence is unknown.`,
    })
  for (const b of h2)
    warnings.push({
      kind: "guest",
      id: String(b._id),
      name: (b.guests || []).map((g) => g.name).join(", "),
      ...getStayWindow(b.stay),
      message: "Overlapping guest accommodation.",
    })
  for (const b of legacy)
    warnings.push({
      kind: "legacy-guest",
      id: String(b._id),
      name: (b.visitors || []).map((g) => g.name).join(", "),
      ...getStayWindow({ fromDate: b.fromDate, toDate: b.toDate }),
      message: "Overlapping visitor booking.",
    })
  for (const b of interns)
    warnings.push({
      kind: "intern",
      id: String(b.requestId?._id || b.requestId),
      name: b.requestId?.applicantName || "Intern",
      from: b.from,
      to: b.to,
      message: "Overlapping H4 reservation.",
    })
  if (room.status !== "Active")
    warnings.push({ kind: "condition", id: "status", message: `Room status: ${room.status}. Confirm it is usable.` })
  const capacity = room.originalCapacity || room.capacity || 0
  if (Math.max(residents.length, room.occupancy || 0) + interns.length + h2.length + legacy.length + 1 > capacity)
    warnings.push({
      kind: "capacity",
      id: "capacity",
      message: `Recorded commitments may exceed ${capacity} bed(s). Confirm actual space.`,
    })
  warnings.sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))
  const fingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        revision: r.h4.revision,
        roomId: String(room._id),
        status: room.status,
        occupancy: room.occupancy,
        capacity,
        from,
        to,
        warnings,
      }),
    )
    .digest("hex")
  return success({
    room: {
      roomId: room._id,
      hostelId,
      hostelName: hostel.name,
      unitNumber: room.unitId?.unitNumber || "",
      roomNumber: room.roomNumber,
      status: room.status,
      capacity,
    },
    from,
    to,
    warnings,
    fingerprint,
    revision: r.h4.revision,
  })
}
export const acknowledgePreview = (preview, body) => {
  if (!preview.success) return preview
  if (body.fingerprint !== preview.data.fingerprint)
    return { ...conflict("Room information changed. Check the room again."), data: { preview: preview.data } }
  if (preview.data.warnings.length && (body.acknowledged !== true || !clean(body.overrideReason)))
    return badRequest("Acknowledge the warnings and enter an override reason")
  return null
}
export const persistReservation = async (r, preview, u, reason, session) => {
  const { room, from, to, fingerprint, warnings } = preview.data
  await owner.reserve({ requestId: r._id, roomId: room.roomId, hostelId: room.hostelId, from, to }, { session })
  r.rooms = [{ roomId: room.roomId, guestIndexes: [0] }]
  r.roomsAssignedBy = u._id
  r.roomsAssignedAt = new Date()
  r.h4.roomHistory.push({ roomId: room.roomId, from, to, by: u._id, reason: clean(reason), fingerprint, warnings })
}
export const h4Rooms = {
  async preview(id, body, u) {
    if (!validId(id)) return badRequest("Invalid request ID")
    u = await freshUser(u)
    if (!u) return forbidden()
    const r = await queries.findH4ById(id)
    if (!r) return notFound("H4 request")
    if (!(await canRead(r, u)) || !["Hostel Supervisor", "Admin"].includes(u.role)) return forbidden()
    let stay = r.stay
    if (body.amendment === true && r.h4.amendment?.changeId) {
      const c = r.scheduleChanges.id(r.h4.amendment.changeId)
      if (c?.status === "pending")
        stay = { ...r.stay.toObject(), fromDate: c.requestedFromDate, toDate: c.requestedToDate }
    }
    return inspectRoom(r, body, u, { stay })
  },
  async assign(id, body, u) {
    return mutate(id, body, u, async (r, actor, session) => {
      if (actor.role !== "Hostel Supervisor") return forbidden()
      if (![S.PAYMENT_VERIFIED, S.ROOMS_ASSIGNED, S.CHECKED_IN].includes(r.status) || !paid(r))
        return badRequest("Verify all payments before assigning rooms")
      if (r.h4.amendment?.stage) return badRequest("Complete the pending date change first")
      const preview = await inspectRoom(r, body, actor, { session })
      const failure = acknowledgePreview(preview, body)
      if (failure) return failure
      if (r.rooms.length && !clean(body.overrideReason)) return badRequest("Enter a reason for moving rooms")
      await persistReservation(r, preview, actor, body.overrideReason, session)
      audit(
        r,
        actor,
        r.status === S.CHECKED_IN ? "Room changed during stay" : "Room assigned",
        r.status === S.CHECKED_IN ? S.CHECKED_IN : S.ROOMS_ASSIGNED,
      )
    })
  },
}
