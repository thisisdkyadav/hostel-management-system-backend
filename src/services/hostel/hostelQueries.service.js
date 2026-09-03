/**
 * Hostel Queries Service
 * ----------------------
 * The single READ surface for the Hostel / Unit / Room / RoomAllocation
 * collections. Every module that needs to read this domain calls these methods
 * instead of importing the models, so `Hostel`/`Room`/`Unit`/`RoomAllocation`
 * are touched only inside `src/services/hostel/` (writes live in
 * roomOwner.service.js). Reads carry no data-integrity risk; centralising them
 * completes the ownership boundary and is the precondition for relocating the
 * collection behind a service/Go boundary later.
 *
 * Methods return raw (usually lean) documents; callers keep their own
 * response-shaping/mapping. Methods that rely on Mongoose getter virtuals
 * (e.g. Unit.capacity/occupancy) return hydrated docs and say so.
 */

import mongoose from "mongoose"
import { Hostel, Room, Unit, RoomAllocation } from "../../models/index.js"

const withSession = (query, session) => (session ? query.session(session) : query)

// Aggregation $match does not auto-cast a string id to ObjectId the way find()
// does, so cast explicitly for aggregate-based reads.
const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value)

export const hostelQueries = {
  // ==================== Hostel ====================

  /** Full hostel doc by id (lean). Optional session for txn reads. */
  async findHostelById(hostelId, { session } = {}) {
    return withSession(Hostel.findById(hostelId), session).lean()
  },

  /** Hostels for the stats dashboard: {_id,name,type,gender,email,phone,extensionNumber,isArchived}. */
  async findHostelsForStats(archive) {
    return Hostel.find(
      { isArchived: archive === "true" },
      { _id: 1, name: 1, type: 1, gender: 1, email: 1, phone: 1, extensionNumber: 1, isArchived: 1 }
    )
  },

  /** Minimal hostel list: {_id,name,type}. */
  async findHostelListMinimal(archive) {
    return Hostel.find({ isArchived: archive === "true" }, { _id: 1, name: 1, type: 1 })
  },

  /** Active (non-archived) hostels, full docs. */
  async findActiveHostels() {
    return Hostel.find({ isArchived: false })
  },

  /** Non-archived hostels sorted by name (lean) — for the allocation summary axis. */
  async findNonArchivedHostelsSorted() {
    return Hostel.find({ isArchived: { $ne: true } }).sort({ name: 1 }).lean()
  },

  /** Hostels by ids with a projection (lean). */
  async findHostelsByIds(ids, select) {
    return Hostel.find({ _id: { $in: ids } }).select(select).lean()
  },

  /** Total hostel count. */
  async countHostels() {
    return Hostel.countDocuments()
  },

  // ==================== Unit ====================

  /** Units of a hostel with their rooms populated. HYDRATED (uses getter virtuals
   *  capacity/occupancy/roomCount), so do not switch to lean. */
  async findUnitsWithRooms(hostelId) {
    return Unit.find({ hostelId }).populate("hostelId").populate({
      path: "rooms",
      options: { sort: { roomNumber: 1 } },
      populate: {
        path: "allocations",
        populate: {
          path: "studentProfileId",
          populate: { path: "userId", select: "name email phone profileImage" },
        },
      },
    })
  },

  /** Units matching the given unit numbers within a hostel. Optional session. */
  async findUnitsByNumbers(hostelId, unitNumbers, { session } = {}) {
    return withSession(Unit.find({ hostelId, unitNumber: { $in: unitNumbers } }), session)
  },

  /** All units of a hostel sorted by unitNumber (lean). */
  async findUnitsByHostelSorted(hostelId) {
    return Unit.find({ hostelId }).sort({ unitNumber: 1 }).lean()
  },

  /** Single unit by number within a hostel. Optional session. */
  async findUnitByNumber(hostelId, unitNumber, { session } = {}) {
    return withSession(Unit.findOne({ unitNumber, hostelId }), session)
  },

  // ==================== Room ====================

  /** Single room by id. Optional select. */
  async findRoomById(roomId, { select } = {}) {
    const query = Room.findById(roomId)
    if (select) query.select(select)
    return query
  },

  /**
   * Aggregated room stats for one hostel (totalRooms, active, occupied, vacant,
   * capacity, occupancy, activeRoomsCapacity/Occupancy). Returns the raw
   * aggregate group object, or null when the hostel has no rooms.
   */
  async getRoomStatsForHostel(hostelId) {
    const result = await Room.aggregate([
      { $match: { hostelId: toObjectId(hostelId) } },
      {
        $group: {
          _id: null,
          totalRooms: { $sum: 1 },
          totalActiveRooms: { $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] } },
          occupiedRoomsCount: { $sum: { $cond: [{ $gt: ["$occupancy", 0] }, 1, 0] } },
          vacantRoomsCount: {
            $sum: {
              $cond: [{ $and: [{ $eq: ["$occupancy", 0] }, { $eq: ["$status", "Active"] }] }, 1, 0],
            },
          },
          totalCapacity: { $sum: "$capacity" },
          totalOccupancy: { $sum: "$occupancy" },
          activeRoomsCapacity: { $sum: { $cond: [{ $eq: ["$status", "Active"] }, "$capacity", 0] } },
          activeRoomsOccupancy: { $sum: { $cond: [{ $eq: ["$status", "Active"] }, "$occupancy", 0] } },
        },
      },
    ])
    return result.length > 0 ? result[0] : null
  },

  /** Global active-room stats (all hostels): totalRooms, occupiedRooms, availableRooms. */
  async getGlobalActiveRoomStats() {
    const result = await Room.aggregate([
      { $match: { status: "Active" } },
      {
        $group: {
          _id: null,
          totalRooms: { $sum: 1 },
          occupiedRooms: { $sum: { $cond: [{ $gt: ["$occupancy", 0] }, 1, 0] } },
          availableRooms: { $sum: { $cond: [{ $eq: ["$occupancy", 0] }, 1, 0] } },
        },
      },
    ])
    return result.length > 0 ? result[0] : null
  },

  /** Room counts for a hostel: { totalRooms, availableRooms, occupiedRooms }. */
  async countRoomsByHostel(hostelId) {
    const [totalRooms, availableRooms, occupiedRooms] = await Promise.all([
      Room.countDocuments({ hostelId }),
      Room.countDocuments({ occupancy: 0, hostelId }),
      Room.countDocuments({ occupancy: { $gt: 0 }, hostelId }),
    ])
    return { totalRooms, availableRooms, occupiedRooms }
  },

  /** Active rooms of a hostel (full docs). */
  async findActiveRoomsForHostel(hostelId) {
    return Room.find({ hostelId, status: "Active" })
  },

  /** Rooms of a hostel with allocations -> studentProfile -> user populated. */
  async findRoomsByHostelWithAllocations(hostelId) {
    return Room.find({ hostelId })
      .populate("hostelId", "name type")
      .populate("unitId", "unitNumber floor")
      .populate({
        path: "allocations",
        populate: {
          path: "studentProfileId",
          populate: { path: "userId", select: "name email phone profileImage" },
        },
      })
  },

  /** Rooms of a unit with allocations + hostel + unit populated. */
  async findRoomsByUnitWithAllocations(unitId) {
    return Room.find({ unitId })
      .populate({
        path: "allocations",
        populate: {
          path: "studentProfileId",
          populate: { path: "userId", select: "name email phone profileImage" },
        },
      })
      .populate("hostelId", "name type")
      .populate("unitId", "unitNumber floor")
  },

  /** Rooms of a hostel with unit populated (for the edit view). */
  async findRoomsForEdit(hostelId) {
    return Room.find({ hostelId }).populate("unitId")
  },

  /** Rooms matching numbers within specific units (unit populated) — bulk update reconcile. */
  async findRoomsByNumbersInUnits(hostelId, roomNumbers, unitIds) {
    return Room.find({
      hostelId,
      roomNumber: { $in: roomNumbers },
      unitId: { $in: unitIds },
    }).populate("unitId", "unitNumber")
  },

  /** Rooms matching numbers within a hostel (room-only) — bulk update reconcile. */
  async findRoomsByNumbers(hostelId, roomNumbers) {
    return Room.find({ hostelId, roomNumber: { $in: roomNumbers } })
  },

  /** Rooms in the given units matching room numbers (session) — bulk allocate. */
  async findRoomsInUnitsByNumbers(unitIds, roomNumbers, { session } = {}) {
    return withSession(Room.find({ unitId: { $in: unitIds }, roomNumber: { $in: roomNumbers } }), session)
  },

  /** Room-only rooms (no unit) matching numbers within a hostel (session) — bulk allocate. */
  async findRoomOnlyByNumbers(hostelId, roomNumbers, { session } = {}) {
    return withSession(
      Room.find({ hostelId, roomNumber: { $in: roomNumbers }, unitId: { $exists: false } }),
      session
    )
  },

  /** Single room by number (+optional unit) within a hostel. Optional session. */
  async findRoomByNumber(hostelId, roomNumber, { unitId, session } = {}) {
    const filter = { hostelId, roomNumber }
    if (unitId) filter.unitId = unitId
    return withSession(Room.findOne(filter), session)
  },

  /** Rooms by ids with unit populated (lean) — accommodation label lookup. */
  async findRoomsByIds(ids, { select = "roomNumber unitId" } = {}) {
    return Room.find({ _id: { $in: ids } }).populate("unitId", "unitNumber").select(select).lean()
  },

  /** All rooms of a hostel sorted by roomNumber (lean) — sheet room-only. */
  async findRoomsByHostelSorted(hostelId) {
    return Room.find({ hostelId }).sort({ roomNumber: 1 }).lean()
  },

  /** Rooms of a hostel within specific units, sorted (lean) — sheet unit-based. */
  async findRoomsByHostelAndUnits(hostelId, unitIds) {
    return Room.find({ hostelId, unitId: { $in: unitIds } }).sort({ roomNumber: 1 }).lean()
  },

  // ---- Guest availability (accommodation) ----

  /** Empty, active rooms of a hostel (lean). */
  async findEmptyActiveRooms(hostelId) {
    return Room.find({ hostelId, status: "Active", occupancy: 0 }).lean()
  },

  /** Distinct hostelIds that have at least one empty active room. */
  async distinctHostelIdsWithEmptyActiveRooms() {
    return Room.distinct("hostelId", { status: "Active", occupancy: 0 })
  },

  /** Guest-eligible rooms: empty+active, optionally also including specific room ids
   *  (rooms a booking already holds), with unit populated (lean). */
  async findGuestEligibleRooms(hostelId, includeRoomIds = []) {
    const emptyActive = { hostelId, status: "Active", occupancy: 0 }
    const filter =
      includeRoomIds.length > 0 ? { $or: [emptyActive, { _id: { $in: includeRoomIds } }] } : emptyActive
    return Room.find(filter).populate("unitId", "unitNumber").lean()
  },

  // ==================== RoomAllocation (reads) ====================

  /** Allocation on a specific bed, with the user populated. */
  async findAllocationByRoomAndBed(roomId, bedNumber) {
    return RoomAllocation.findOne({ roomId, bedNumber }).populate("userId").exec()
  },

  /** A user's current allocation with hostel/room/unit populated. */
  async findCurrentAllocationByUser(userId) {
    return RoomAllocation.findOne({ userId })
      .populate("roomId")
      .populate("unitId")
      .populate("hostelId")
  },

  /** All allocations in a hostel with student + user populated (lean) — sheet. */
  async findAllocationsWithStudentByHostel(hostelId) {
    return RoomAllocation.find({ hostelId })
      .populate({
        path: "studentProfileId",
        select:
          "rollNumber department degree gender admissionDate guardian guardianPhone status isDayScholar",
        populate: { path: "userId", select: "name email phone profileImage" },
      })
      .lean()
  },

  /** Every allocation with student.degree + hostel.name populated (lean) — summary matrix. */
  async findAllAllocationsForSummary() {
    return RoomAllocation.find({})
      .populate({ path: "studentProfileId", select: "degree" })
      .populate({ path: "hostelId", select: "name" })
      .lean()
  },

  /** All allocations for a hostel (session optional) — replace-mode bulk clear. */
  async findAllocationsByHostel(hostelId, { session, select } = {}) {
    let query = RoomAllocation.find({ hostelId })
    if (select) query = query.select(select)
    return withSession(query, session)
  },

  /** Allocations on the given (rooms x beds) — bed conflict detection (session). */
  async findAllocationsByRoomsAndBeds(roomIds, bedNumbers, { session } = {}) {
    return withSession(
      RoomAllocation.find({ roomId: { $in: roomIds }, bedNumber: { $in: bedNumbers } }),
      session
    )
  },

  /** Current allocations for the given student profiles (session). */
  async findAllocationsByStudentProfiles(studentProfileIds, { session } = {}) {
    return withSession(RoomAllocation.find({ studentProfileId: { $in: studentProfileIds } }), session)
  },

  /** A user's (raw, unpopulated) allocation — used to resolve a student's hostel. */
  async findAllocationByUserId(userId) {
    return RoomAllocation.findOne({ userId })
  },

  /** One allocation by id with its room (-> unit) and hostel populated — dashboard room card. */
  async findAllocationByIdWithRoom(allocationId) {
    return RoomAllocation.findById(allocationId)
      .populate({ path: "roomId", populate: { path: "unitId", select: "unitNumber" } })
      .populate("hostelId", "name type")
  },

  /** Other allocations sharing a room (excluding one), with student + user populated — roommates. */
  async findRoommateAllocations(roomId, excludeAllocationId) {
    return RoomAllocation.find({ roomId, _id: { $ne: excludeAllocationId } }).populate({
      path: "studentProfileId",
      select: "rollNumber userId",
      populate: { path: "userId", select: "name profileImage" },
    })
  },
}

export default hostelQueries
