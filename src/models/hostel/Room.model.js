/**
 * Room Model
 * Room entity within hostels
 */

import mongoose from "mongoose"

/**
 * Allowed room statuses.
 * "Active" is the only operational state: allocatable, counted in capacity/occupancy,
 * and shown with bed-level detail. Every other value (the deactivated states) behaves
 * the same way "Inactive" always has — capacity zeroed, allocations removed, excluded
 * from stats — and exists so new code can distinguish *why* a room is out of service.
 */
export const ROOM_STATUSES = ["Active", "Inactive", "Guest", "Storage", "Maintenance"]

// "Guest" is set/cleared automatically by the guest-accommodation flow (a room is
// flipped to Guest while a booking occupies it and back to Active afterwards). It
// must never be applied by hand, so admin-facing status changes use this subset.
export const MANUAL_ROOM_STATUSES = ROOM_STATUSES.filter((s) => s !== "Guest")

const RoomSchema = new mongoose.Schema(
  {
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" }, // Optional, only for unit-based hostels
    roomNumber: { type: String, required: true }, // For unit-based: A, B, C... For room-only: 101, 102...
    capacity: { type: Number, required: true, default: 1 },
    occupancy: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ROOM_STATUSES,
      default: "Active",
    },
    originalCapacity: { type: Number },
    currentRoomAllocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomAllocation",
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

RoomSchema.index({ hostelId: 1, unitId: 1, roomNumber: 1 }, { unique: true })
RoomSchema.index({ hostelId: 1, roomNumber: 1 })
RoomSchema.index({ hostelId: 1, status: 1 })
RoomSchema.index({ unitId: 1, roomNumber: 1 })

RoomSchema.virtual("allocations", {
  ref: "RoomAllocation",
  localField: "_id",
  foreignField: "roomId",
  justOne: false,
})

RoomSchema.virtual("students", {
  ref: "StudentProfile",
  localField: "allocations.studentProfileId",
  foreignField: "_id",
  justOne: false,
})

RoomSchema.statics.deactivateRoom = async function (roomId, status = "Inactive") {
  const room = await this.findById(roomId)
  if (!room) return null

  // Only capture the real capacity when leaving the Active state, so transitions
  // between non-active states (e.g. Inactive -> Guest) don't clobber it with 0.
  if (room.status === "Active") {
    room.originalCapacity = room.capacity
  }
  room.capacity = 0
  room.status = status
  return await room.save()
}

RoomSchema.statics.activateRoom = async function (roomId) {
  const room = await this.findById(roomId)
  if (!room) return null

  if (room.originalCapacity) {
    room.capacity = room.originalCapacity
    room.originalCapacity = undefined
  }
  room.status = "Active"
  return await room.save()
}

RoomSchema.statics.deactivateRooms = async function (roomIds, status = "Inactive") {
  // First, get all rooms to preserve originalCapacity values
  const rooms = await this.find({ _id: { $in: roomIds } })

  // Prepare bulk update operations
  const bulkOps = rooms.map((room) => ({
    updateOne: {
      filter: { _id: room._id },
      update: {
        $set: {
          // Preserve capacity only when leaving Active; keep it across non-active transitions.
          originalCapacity: room.status === "Active" ? room.capacity : room.originalCapacity,
          capacity: 0,
          occupancy: 0,
          status,
        },
      },
    },
  }))

  // Execute bulk operation
  if (bulkOps.length > 0) {
    await this.bulkWrite(bulkOps)
  }

  // Return updated rooms
  return await this.find({ _id: { $in: roomIds } })
}

RoomSchema.statics.activateRooms = async function (roomIds) {
  // First, get all rooms to access their originalCapacity values
  const rooms = await this.find({ _id: { $in: roomIds } })

  // Prepare bulk update operations
  const bulkOps = rooms.map((room) => ({
    updateOne: {
      filter: { _id: room._id },
      update: {
        $set: {
          capacity: room.originalCapacity || room.capacity,
          status: "Active",
        },
        $unset: { originalCapacity: "" },
      },
    },
  }))

  // Execute bulk operation
  if (bulkOps.length > 0) {
    await this.bulkWrite(bulkOps)
  }

  // Return updated rooms
  return await this.find({ _id: { $in: roomIds } })
}

const Room = mongoose.model("Room", RoomSchema)
export default Room
