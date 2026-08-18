/**
 * Room Owner Service
 * ------------------
 * The single owner of all WRITES to Room occupancy/capacity/status and to the
 * RoomAllocation collection. Every module that changes room or allocation state
 * (hostel-rooms, admin/hostel, profiles-admin, accommodation) goes through these
 * operations instead of touching the models directly.
 *
 * Invariant guaranteed, per room it touches, on commit:
 *   - Room.occupancy === count(RoomAllocation for that room)
 *   - 0 <= Room.occupancy <= Room.capacity   (allocation never exceeds capacity)
 *   - occupancy is never negative
 *   - every allocation's bedNumber is in 1..Room.capacity
 *   - only Active, non-day-scholar students hold an allocation
 *
 * How it stays correct where the old code did not:
 *   - Allocation writes go through applyAllocations, which evicts the occupant
 *     of a claimed bed (and the incoming student's previous room) before insert,
 *     then refuses any write that would leave occupancy > capacity.
 *   - Reducing capacity vacates beds above the new capacity and any overflow.
 *   - Allocation writes + the occupancy change run in the SAME transaction.
 *   - Room status/capacity flips use aggregation-pipeline updates that reference
 *     the current field values atomically, replacing the read-modify-write
 *     statics that clobbered capacity under concurrency.
 *
 * Coexistence with the legacy RoomAllocation hooks:
 *   All allocation writes here use the NATIVE driver (RoomAllocation.collection.*)
 *   so the Mongoose lifecycle hooks do NOT fire for owner writes — this service
 *   owns occupancy + the StudentProfile currentRoomAllocation field explicitly. That lets
 *   the owner run alongside the still-hooked legacy paths during migration; once
 *   every writer is routed here, the hooks are removed (Phase 3).
 */

import mongoose from "mongoose"
import { success, badRequest, notFound, withTransaction } from "../base/index.js"
import { Hostel, Room, Unit, RoomAllocation } from "../../models/index.js"
import { studentProfileOwner } from "../student/studentProfileOwner.service.js"
import { studentProfileQueries } from "../student/studentProfileQueries.service.js"
import { MANUAL_ROOM_STATUSES } from "../../models/hostel/Room.model.js"

const STUDENT_STATUS_ACTIVE = "Active"

class AllocationError extends Error {
  constructor(message, statusCode = 400) {
    super(message)
    this.name = "AllocationError"
    this.statusCode = statusCode
  }
}

const isAllocatableStudent = (student) => (
  Boolean(student)
  && student.status === STUDENT_STATUS_ACTIVE
  && student.isDayScholar !== true
)

const studentAllocationError = (student) => {
  if (!student) return new AllocationError("Student profile not found", 404)
  if (student.isDayScholar === true) {
    return new AllocationError("Day scholars cannot be allocated a room")
  }
  if (student.status !== STUDENT_STATUS_ACTIVE) {
    return new AllocationError("Only active students can be allocated a room")
  }
  return new AllocationError("Student cannot be allocated a room")
}

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value)

const uniqueObjectIds = (roomIds) =>
  [...new Set((roomIds || []).map((id) => String(id)).filter(Boolean))].map(toObjectId)

/**
 * Coerce a bed number to the positive integer the schema declares (type: Number).
 * The native-driver inserts below bypass Mongoose casting, so without this a
 * string "1" from a request body would be persisted as a string — which then
 * fails to match the Number-cast bed-conflict reads and slips past the unique
 * { roomId, bedNumber } index (string "1" != number 1). Coercing here is the
 * single guard that keeps every persisted bedNumber a real number.
 */
const toBedNumber = (value) => {
  const n = typeof value === "number" ? value : Number(String(value).trim())
  if (!Number.isInteger(n) || n <= 0) {
    const err = new Error(`Invalid bed number: ${JSON.stringify(value)}`)
    err.statusCode = 400
    throw err
  }
  return n
}

/**
 * Build a plain RoomAllocation document for a native insert (bypasses hooks).
 * Mirrors the schema's required fields + timestamps.
 */
const buildAllocationDoc = ({ userId, studentProfileId, hostelId, roomId, unitId, bedNumber }) => {
  const now = new Date()
  const doc = {
    _id: new mongoose.Types.ObjectId(),
    userId: toObjectId(userId),
    studentProfileId: toObjectId(studentProfileId),
    hostelId: toObjectId(hostelId),
    roomId: toObjectId(roomId),
    bedNumber: toBedNumber(bedNumber),
    createdAt: now,
    updatedAt: now,
  }
  if (unitId) doc.unitId = toObjectId(unitId)
  return doc
}

/**
 * Recompute Room.occupancy = count(RoomAllocation) for the given rooms from
 * ground truth, inside the caller's session. Drift-proof way to settle occupancy
 * after a batch of allocation writes.
 */
async function syncOccupancy(roomIds, session) {
  const objectIds = uniqueObjectIds(roomIds)
  if (objectIds.length === 0) return

  const counts = await RoomAllocation.aggregate([
    { $match: { roomId: { $in: objectIds } } },
    { $group: { _id: "$roomId", count: { $sum: 1 } } },
  ]).session(session ?? null)

  const countByRoom = new Map(counts.map((c) => [String(c._id), c.count]))
  const ops = objectIds.map((id) => ({
    updateOne: {
      filter: { _id: id },
      update: { $set: { occupancy: countByRoom.get(String(id)) || 0 } },
    },
  }))
  if (ops.length > 0) await Room.bulkWrite(ops, { session })
}

/**
 * Atomically restore rooms to Active: capacity restored from originalCapacity,
 * status Active, originalCapacity cleared. No allocation impact (deactivated
 * rooms hold no allocations), so occupancy is left as-is (0).
 */
async function activateRoomsRaw(roomIds, session) {
  const ids = uniqueObjectIds(roomIds)
  if (ids.length === 0) return
  await Room.updateMany(
    { _id: { $in: ids } },
    [
      { $set: { capacity: { $ifNull: ["$originalCapacity", "$capacity"] }, status: "Active" } },
      { $unset: "originalCapacity" },
    ],
    { session, updatePipeline: true }
  )
}

/**
 * Atomically deactivate rooms to `status`: capacity + occupancy zeroed,
 * originalCapacity captured only when leaving Active, and all allocations on
 * those rooms vacated (native delete + profile pointer cleared).
 */
async function deactivateRoomsRaw(roomIds, status, session) {
  const ids = uniqueObjectIds(roomIds)
  if (ids.length === 0) return

  await Room.updateMany(
    { _id: { $in: ids } },
    [
      {
        $set: {
          originalCapacity: {
            $cond: [{ $eq: ["$status", "Active"] }, "$capacity", "$originalCapacity"],
          },
          capacity: 0,
          occupancy: 0,
          status,
        },
      },
    ],
    { session, updatePipeline: true }
  )

  const allocations = await RoomAllocation.find({ roomId: { $in: ids } })
    .select("_id")
    .session(session)
    .lean()
  if (allocations.length > 0) {
    const allocationIds = allocations.map((a) => a._id)
    await studentProfileOwner.updateMany(
      { currentRoomAllocation: { $in: allocationIds } },
      { $unset: { currentRoomAllocation: "" } },
      { session }
    )
    await RoomAllocation.collection.deleteMany({ roomId: { $in: ids } }, { session })
  }
}

/**
 * Vacate allocations that cannot stay at `capacity`: ineligible students
 * (not Active, or day scholar), beds numbered above capacity, then overflow
 * by highest remaining bed. Sets capacity and occupancy from the leftover.
 */
async function forceVacateToCapacity(roomId, capacity, session) {
  const allocations = await RoomAllocation.find({ roomId })
    .select("_id studentProfileId bedNumber")
    .sort({ bedNumber: -1 })
    .session(session)
    .lean()

  const studentIds = uniqueObjectIds(allocations.map((a) => a.studentProfileId))
  const students = studentIds.length > 0
    ? await studentProfileQueries.findByIds(studentIds, {
      select: "status isDayScholar",
      session,
      lean: true,
    })
    : []
  const studentById = new Map(students.map((student) => [String(student._id), student]))

  const ineligible = []
  const overBed = []
  const within = []
  for (const allocation of allocations) {
    const student = studentById.get(String(allocation.studentProfileId))
    if (!isAllocatableStudent(student)) {
      ineligible.push(allocation)
    } else if (allocation.bedNumber > capacity) {
      overBed.push(allocation)
    } else {
      within.push(allocation)
    }
  }

  const extra = within.length > capacity ? within.slice(0, within.length - capacity) : []
  const excess = [...ineligible, ...overBed, ...extra]
  const vacated = []

  if (excess.length > 0) {
    const excessIds = excess.map((a) => a._id)
    await studentProfileOwner.updateMany(
      { currentRoomAllocation: { $in: excessIds } },
      { $unset: { currentRoomAllocation: "" } },
      { session }
    )
    await RoomAllocation.collection.deleteMany({ _id: { $in: excessIds } }, { session })
    vacated.push(
      ...excess.map((a) => ({
        roomId,
        allocationId: a._id,
        studentProfileId: a.studentProfileId,
        bedNumber: a.bedNumber,
      }))
    )
  }

  const remaining = allocations.length - excess.length
  await Room.updateOne({ _id: roomId }, { $set: { capacity, occupancy: remaining } }, { session })
  return vacated
}

async function removeAllocationsByIds(allocationIds, session) {
  const ids = uniqueObjectIds(allocationIds)
  if (ids.length === 0) return []

  const removing = await RoomAllocation.find({ _id: { $in: ids } })
    .select("_id roomId")
    .session(session)
    .lean()
  if (removing.length === 0) return []

  const removedIds = removing.map((a) => a._id)
  await studentProfileOwner.updateMany(
    { currentRoomAllocation: { $in: removedIds } },
    { $unset: { currentRoomAllocation: "" } },
    { session }
  )
  await RoomAllocation.collection.deleteMany({ _id: { $in: removedIds } }, { session })
  return removing
}

/**
 * Apply deletes + creates inside the caller's session. This is the hard gate:
 * incoming students must be Active hostellers, each bed must fit in the room's
 * capacity, occupied beds (and the incoming student's previous room) are
 * vacated first, and the write is refused if occupancy would exceed capacity.
 */
async function applyAllocationsInSession({ deleteIds = [], createInputs = [] }, session) {
  const createdDocs = createInputs.map(buildAllocationDoc)
  const deleteSet = new Set((deleteIds || []).map((id) => String(id)))
  const affected = new Set()

  if (createdDocs.length > 0) {
    const seenStudents = new Set()
    const claimedBeds = new Set()
    const studentIds = uniqueObjectIds(createdDocs.map((doc) => doc.studentProfileId))
    const roomIds = uniqueObjectIds(createdDocs.map((doc) => doc.roomId))

    const [students, rooms] = await Promise.all([
      studentProfileQueries.findByIds(studentIds, {
        select: "status isDayScholar userId",
        session,
        lean: true,
      }),
      Room.find({ _id: { $in: roomIds } }).session(session).lean(),
    ])
    const studentById = new Map(students.map((student) => [String(student._id), student]))
    const roomById = new Map(rooms.map((room) => [String(room._id), room]))

    for (const doc of createdDocs) {
      const studentKey = String(doc.studentProfileId)
      if (seenStudents.has(studentKey)) {
        throw new AllocationError("Student is assigned more than once in this allocation")
      }
      seenStudents.add(studentKey)

      const student = studentById.get(studentKey)
      if (!isAllocatableStudent(student)) throw studentAllocationError(student)

      const room = roomById.get(String(doc.roomId))
      if (!room) throw new AllocationError("Room not found", 404)
      if (room.status !== "Active") throw new AllocationError("Cannot allocate an inactive room")
      if (doc.hostelId && String(room.hostelId) !== String(doc.hostelId)) {
        throw new AllocationError("Room does not belong to the specified hostel")
      }
      if (doc.bedNumber < 1 || doc.bedNumber > room.capacity) {
        throw new AllocationError(`Invalid bed number. Must be between 1 and ${room.capacity}`)
      }

      const bedKey = `${doc.roomId}:${doc.bedNumber}`
      if (claimedBeds.has(bedKey)) {
        throw new AllocationError(`Bed ${doc.bedNumber} is assigned to more than one student`)
      }
      claimedBeds.add(bedKey)
      affected.add(String(doc.roomId))
    }

    const conflictOr = [
      { studentProfileId: { $in: studentIds } },
      ...createdDocs.map((doc) => ({ roomId: doc.roomId, bedNumber: doc.bedNumber })),
    ]
    const conflicts = await RoomAllocation.find({ $or: conflictOr })
      .select("_id roomId")
      .session(session)
      .lean()
    conflicts.forEach((allocation) => {
      deleteSet.add(String(allocation._id))
      affected.add(String(allocation.roomId))
    })
  }

  const providedDeletes = deleteSet.size > 0
    ? await RoomAllocation.find({ _id: { $in: [...deleteSet].map(toObjectId) } })
      .select("_id roomId studentProfileId")
      .session(session)
      .lean()
    : []
  providedDeletes.forEach((allocation) => affected.add(String(allocation.roomId)))

  const roomsToSweep = [...affected].map(toObjectId)
  if (roomsToSweep.length > 0) {
    const roomAllocations = await RoomAllocation.find({ roomId: { $in: roomsToSweep } })
      .select("_id roomId studentProfileId bedNumber")
      .session(session)
      .lean()
    const occupantIds = uniqueObjectIds(roomAllocations.map((a) => a.studentProfileId))
    const occupants = occupantIds.length > 0
      ? await studentProfileQueries.findByIds(occupantIds, {
        select: "status isDayScholar",
        session,
        lean: true,
      })
      : []
    const occupantById = new Map(occupants.map((student) => [String(student._id), student]))

    for (const allocation of roomAllocations) {
      if (!isAllocatableStudent(occupantById.get(String(allocation.studentProfileId)))) {
        deleteSet.add(String(allocation._id))
      }
    }

    const remainingByRoom = {}
    for (const allocation of roomAllocations) {
      if (deleteSet.has(String(allocation._id))) continue
      const roomKey = String(allocation.roomId)
      remainingByRoom[roomKey] = (remainingByRoom[roomKey] || 0) + 1
    }

    const roomById = new Map(
      (await Room.find({ _id: { $in: roomsToSweep } }).select("capacity").session(session).lean())
        .map((room) => [String(room._id), room])
    )

    for (const doc of createdDocs) {
      const roomKey = String(doc.roomId)
      const room = roomById.get(roomKey)
      remainingByRoom[roomKey] = (remainingByRoom[roomKey] || 0) + 1
      if (!room || remainingByRoom[roomKey] > room.capacity) {
        throw new AllocationError("Room is already at full capacity")
      }
    }
  }

  if (deleteSet.size > 0) {
    const removed = await removeAllocationsByIds([...deleteSet], session)
    removed.forEach((allocation) => affected.add(String(allocation.roomId)))
  }

  if (createdDocs.length > 0) {
    await RoomAllocation.collection.insertMany(createdDocs, { session })
    const profileOps = createdDocs.map((doc) => ({
      updateOne: {
        filter: { _id: doc.studentProfileId },
        update: { $set: { currentRoomAllocation: doc._id } },
      },
    }))
    await studentProfileOwner.bulkWrite(profileOps, { session })
  }

  await syncOccupancy([...affected], session)

  if (affected.size > 0) {
    const settled = await Room.find({ _id: { $in: [...affected].map(toObjectId) } })
      .select("occupancy capacity")
      .session(session)
      .lean()
    if (settled.some((room) => room.occupancy > room.capacity)) {
      throw new AllocationError("Room occupancy would exceed capacity")
    }
  }

  return { createdDocs }
}

/**
 * Resolve the units a batch of rooms should attach to, creating only the ones
 * that don't already exist. Returns unitNumber -> unitId for both pre-existing
 * and newly created units.
 */
async function resolveUnits(hostelId, units, session) {
  const unitMap = {}
  if (!Array.isArray(units)) return unitMap

  const requested = new Map()
  for (const unitData of units) {
    const unitNumber = typeof unitData === "string" ? unitData : unitData?.unitNumber
    if (!unitNumber || requested.has(unitNumber)) continue
    requested.set(unitNumber, unitData)
  }
  if (requested.size === 0) return unitMap

  const existing = await Unit.find({
    hostelId,
    unitNumber: { $in: [...requested.keys()] },
  }).session(session ?? null)
  existing.forEach((unit) => {
    unitMap[unit.unitNumber] = unit._id
  })

  const unitsToInsert = [...requested.entries()]
    .filter(([unitNumber]) => !unitMap[unitNumber])
    .map(([unitNumber, unitData]) => ({
      hostelId,
      unitNumber,
      floor:
        (typeof unitData === "object" && unitData?.floor) ||
        parseInt(unitNumber.charAt(0), 10) - 1 ||
        0,
      commonAreaDetails: (typeof unitData === "object" && unitData?.commonAreaDetails) || "",
    }))

  if (unitsToInsert.length > 0) {
    const savedUnits = await Unit.insertMany(unitsToInsert, { session })
    savedUnits.forEach((unit) => {
      unitMap[unit.unitNumber] = unit._id
    })
  }

  return unitMap
}

/** Create rooms for a batch, attaching to resolved units when unit-based. */
async function createRooms(hostelId, rooms, createdUnits, type, session) {
  if (!Array.isArray(rooms)) return

  for (const roomData of rooms) {
    const { unitNumber, roomNumber, capacity, status } = roomData
    if (!roomNumber || !capacity) continue

    const roomFields = {
      hostelId,
      roomNumber,
      // "Guest" is system-managed; ignore it (and anything invalid) on manual create.
      status: MANUAL_ROOM_STATUSES.includes(status) ? status : "Active",
      capacity,
      occupancy: 0,
    }
    if (type === "unit-based" && unitNumber && createdUnits[unitNumber]) {
      roomFields.unitId = createdUnits[unitNumber]
    }

    await new Room(roomFields).save({ session })
  }
}

export const roomOwner = {
  syncOccupancy,

  /**
   * Create a hostel with its units and rooms (transactional). Occupancy starts
   * at 0. Mirrors the legacy admin addHostel.
   */
  async createHostel(hostelData) {
    return withTransaction(async (session) => {
      const { name, gender, type, units, rooms } = hostelData
      if (!name || !gender || !type) return badRequest("Missing required hostel information")

      const savedHostel = await new Hostel({ name, gender, type }).save({ session })
      const hostelId = savedHostel._id

      const createdUnits = {}
      if (type === "unit-based" && Array.isArray(units)) {
        for (const unitData of units) {
          if (!unitData.unitNumber) continue
          const unit = await new Unit({
            hostelId,
            unitNumber: unitData.unitNumber,
            floor: unitData.floor || 0,
            commonAreaDetails: unitData.commonAreaDetails || "",
          }).save({ session })
          createdUnits[unitData.unitNumber] = unit._id
        }
      }

      if (Array.isArray(rooms)) {
        for (const roomData of rooms) {
          if (!roomData.roomNumber || !roomData.capacity) continue
          const roomFields = {
            hostelId,
            roomNumber: roomData.roomNumber,
            capacity: roomData.capacity,
            status: "Active",
            occupancy: 0,
          }
          if (type === "unit-based" && roomData.unitNumber && createdUnits[roomData.unitNumber]) {
            roomFields.unitId = createdUnits[roomData.unitNumber]
          }
          await new Room(roomFields).save({ session })
        }
      }

      return success(
        {
          id: hostelId,
          name,
          gender,
          type,
          totalUnits: Object.keys(createdUnits).length,
          totalRooms: Array.isArray(rooms) ? rooms.length : 0,
        },
        201,
        "Hostel added successfully"
      )
    })
  },

  /** Update editable hostel fields (name, gender). */
  async updateHostel(hostelId, { name, gender }) {
    const updatedHostel = await Hostel.findByIdAndUpdate(hostelId, { name, gender }, { new: true })
    if (!updatedHostel) return notFound("Hostel not found")
    return success(updatedHostel)
  },

  /** Toggle a hostel's archived flag. */
  async archiveHostel(hostelId, status) {
    const updated = await Hostel.findByIdAndUpdate(
      hostelId,
      { isArchived: status, updatedAt: new Date() },
      { new: true }
    )
    if (!updated) return notFound("Hostel not found")
    return success(null, 200, "Hostel archive status updated successfully")
  },

  /** Add rooms (and any missing units) to an existing hostel, transactionally. */
  async addRooms(hostelId, roomsData) {
    const { rooms, units } = roomsData
    const hostel = await Hostel.findById(hostelId)
    if (!hostel) return notFound("Hostel not found")

    await withTransaction(async (session) => {
      const unitMap = await resolveUnits(hostelId, units, session)
      await createRooms(hostelId, rooms, unitMap, hostel.type, session)
    })

    return success(null, 200, "Rooms added successfully")
  },

  /**
   * Allocate one student to a specific bed. Active hostellers only. If the bed
   * is occupied, the previous student is fully vacated first. If the incoming
   * student already has a room, that allocation is vacated too (a move).
   */
  async allocate({ roomId, hostelId, unitId, studentId, bedNumber, userId }) {
    if (!roomId || !hostelId || !studentId || !bedNumber || !userId) {
      return badRequest("Missing required fields")
    }

    try {
      return await withTransaction(async (session) => {
        const hostel = await Hostel.findById(hostelId).session(session)
        if (!hostel) throw new AllocationError("Hostel not found", 404)
        if (hostel.type === "unit-based" && !unitId) {
          throw new AllocationError("Unit ID is required for unit-based hostels")
        }

        const room = await Room.findById(roomId).session(session)
        if (!room) throw new AllocationError("Room not found", 404)
        if (room.status !== "Active") throw new AllocationError("Cannot allocate an inactive room")
        if (String(room.hostelId) !== String(hostel._id)) {
          throw new AllocationError("Room does not belong to the specified hostel")
        }

        const { createdDocs } = await applyAllocationsInSession({
          createInputs: [{
            userId,
            studentProfileId: studentId,
            hostelId,
            roomId,
            unitId: hostel.type === "unit-based" ? (room.unitId || unitId) : undefined,
            bedNumber,
          }],
        }, session)

        return success(createdDocs[0], 200, "Room allocated successfully")
      })
    } catch (err) {
      if (err instanceof AllocationError || err?.name === "AllocationError") {
        return err.statusCode === 404 ? notFound(err.message) : badRequest(err.message)
      }
      if (err?.statusCode === 400) return badRequest(err.message)
      throw err
    }
  },

  /**
   * Deallocate one allocation by id. Guarded release (never goes negative).
   */
  async deallocate(allocationId) {
    return withTransaction(async (session) => {
      const alloc = await RoomAllocation.findById(allocationId).session(session).lean()
      if (!alloc) return notFound("Allocation not found")

      await RoomAllocation.collection.deleteOne({ _id: toObjectId(allocationId) }, { session })
      await studentProfileOwner.updateOne(
        { _id: alloc.studentProfileId, currentRoomAllocation: alloc._id },
        { $unset: { currentRoomAllocation: "" } },
        { session }
      )
      await Room.updateOne(
        { _id: alloc.roomId, occupancy: { $gt: 0 } },
        { $inc: { occupancy: -1 } },
        { session }
      )

      return success(null, 200, "Room allocation deleted successfully")
    })
  },

  /**
   * Apply a batch of allocation deletes + creates atomically, then settle
   * occupancy for every affected room by recomputing from ground truth.
   * The caller owns the txn. Occupied target beds and the incoming students'
   * previous rooms are vacated before insert.
   *
   * @returns {Promise<{createdDocs: Array}>}
   */
  async applyAllocations({ deleteIds = [], createInputs = [] }, session) {
    return applyAllocationsInSession({ deleteIds, createInputs }, session)
  },

  /**
   * Bulk deallocate every allocation held by the given students. Accepts the
   * caller's session so it composes inside a larger transaction.
   */
  async deallocateStudents({ studentProfileIds = [] }, session) {
    if (!Array.isArray(studentProfileIds) || studentProfileIds.length === 0) return 0

    const allocations = await RoomAllocation.find({ studentProfileId: { $in: studentProfileIds } })
      .select("_id roomId")
      .session(session)
      .lean()
    if (allocations.length === 0) return 0

    const allocationIds = allocations.map((a) => a._id)
    await studentProfileOwner.updateMany(
      { currentRoomAllocation: { $in: allocationIds } },
      { $unset: { currentRoomAllocation: "" } },
      { session }
    )
    await RoomAllocation.collection.deleteMany({ _id: { $in: allocationIds } }, { session })
    await syncOccupancy(allocations.map((a) => a.roomId), session)

    return allocationIds.length
  },

  /**
   * Delete ALL allocations for a hostel and reset occupancy to 0 deterministically.
   */
  async deleteAllAllocations(hostelId) {
    return withTransaction(async (session) => {
      const allocations = await RoomAllocation.find({ hostelId }).select("_id").session(session).lean()
      const allocationIds = allocations.map((a) => a._id)

      if (allocationIds.length > 0) {
        await studentProfileOwner.updateMany(
          { currentRoomAllocation: { $in: allocationIds } },
          { $unset: { currentRoomAllocation: "" } },
          { session }
        )
        await RoomAllocation.collection.deleteMany({ _id: { $in: allocationIds } }, { session })
      }
      await Room.updateMany({ hostelId }, { $set: { occupancy: 0 } }, { session })

      return success(null, 200, "All allocations deleted")
    })
  },

  /**
   * Set a single room's status. Reuses the atomic activate/deactivate helpers.
   */
  async setRoomStatus(roomId, status, { manualStatuses } = {}) {
    if (manualStatuses && !manualStatuses.includes(status)) {
      return badRequest('Invalid status value ("Guest" is set automatically for accommodation bookings)')
    }

    return withTransaction(async (session) => {
      const exists = await Room.findById(roomId).select("_id").session(session)
      if (!exists) return notFound("Room not found")

      if (status === "Active") {
        await activateRoomsRaw([roomId], session)
      } else {
        await deactivateRoomsRaw([roomId], status, session)
      }

      const room = await Room.findById(roomId).session(session)
      return success(room, 200, "Room status updated successfully")
    })
  },

  /** Bulk activate rooms (restore capacity + Active). */
  async activateRooms(roomIds) {
    return withTransaction(async (session) => {
      await activateRoomsRaw(roomIds, session)
      return success(null, 200, "Rooms activated")
    })
  },

  /** Bulk deactivate rooms to `status` (zero capacity/occupancy + vacate allocations). */
  async deactivateRooms(roomIds, status) {
    return withTransaction(async (session) => {
      await deactivateRoomsRaw(roomIds, status, session)
      return success(null, 200, "Rooms deactivated")
    })
  },

  /**
   * Set a single room's capacity, force-vacating the highest beds if the new
   * capacity is below current occupancy. Returns the vacated allocations.
   */
  async setRoomCapacity(roomId, capacity) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      return badRequest("Capacity must be a non-negative integer")
    }
    return withTransaction(async (session) => {
      const room = await Room.findById(roomId).select("_id").session(session)
      if (!room) return notFound("Room not found")
      const vacated = await forceVacateToCapacity(roomId, capacity, session)
      return success({ vacated }, 200, "Room updated successfully")
    })
  },

  /**
   * Set capacity for many rooms in one transaction, force-vacating as needed.
   * @param {Array<{roomId, capacity}>} updates
   */
  async setRoomsCapacity(updates = []) {
    return withTransaction(async (session) => {
      const vacated = []
      for (const { roomId, capacity } of updates) {
        vacated.push(...(await forceVacateToCapacity(roomId, capacity, session)))
      }
      return success({ vacated }, 200, "Rooms updated")
    })
  },

  /**
   * Guest flow: hold rooms for a guest booking by flipping Active -> "Guest"
   * (capacity captured into originalCapacity, then zeroed) atomically. Only rooms
   * currently Active are flipped, so originalCapacity is never clobbered.
   */
  async holdRoomsForGuest(roomIds, session) {
    const ids = uniqueObjectIds(roomIds)
    if (ids.length === 0) return
    // Only empty Active rooms can flip: setting capacity to 0 on an occupied
    // room would make occupancy > capacity.
    await Room.updateMany(
      { _id: { $in: ids }, status: "Active", occupancy: 0 },
      [{ $set: { originalCapacity: "$capacity", capacity: 0, occupancy: 0, status: "Guest" } }],
      { session, updatePipeline: true }
    )
  },

  /** Guest flow: release rooms back to the normal Active pool atomically. */
  async releaseRooms(roomIds, session) {
    await activateRoomsRaw(roomIds, session)
  },

  /**
   * Reconcile: recompute Room.occupancy from actual allocation counts for every
   * room matching `filter` (default: all rooms). Heals historical drift; safe to
   * run any time. Returns a report of the rooms it corrected.
   */
  async reconcileOccupancy(filter = {}) {
    const rooms = await Room.find(filter).select("_id occupancy").lean()
    if (rooms.length === 0) return success({ checked: 0, corrected: [] }, 200, "Nothing to reconcile")

    const roomIds = rooms.map((r) => r._id)
    const counts = await RoomAllocation.aggregate([
      { $match: { roomId: { $in: roomIds } } },
      { $group: { _id: "$roomId", count: { $sum: 1 } } },
    ])
    const countByRoom = new Map(counts.map((c) => [String(c._id), c.count]))

    const corrected = []
    const ops = []
    for (const room of rooms) {
      const actual = countByRoom.get(String(room._id)) || 0
      if (actual !== room.occupancy) {
        corrected.push({ roomId: room._id, from: room.occupancy, to: actual })
        ops.push({ updateOne: { filter: { _id: room._id }, update: { $set: { occupancy: actual } } } })
      }
    }
    if (ops.length > 0) await Room.bulkWrite(ops)

    await withTransaction(async (session) => {
      const latest = await Room.find(filter).select("_id capacity occupancy").session(session).lean()
      for (const room of latest) {
        await forceVacateToCapacity(room._id, room.capacity, session)
      }
    })

    return success({ checked: rooms.length, corrected }, 200, `Reconciled ${corrected.length} room(s)`)
  },
}

export default roomOwner
