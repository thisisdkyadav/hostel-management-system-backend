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

// Room capacity/status/occupancy transitions are owned by the room owner service
// (src/services/hostel/roomOwner.service.js), which mutates rooms atomically. The
// old read-modify-write statics (activate/deactivate) were removed to keep all
// write logic in one place.

const Room = mongoose.model("Room", RoomSchema)
export default Room
