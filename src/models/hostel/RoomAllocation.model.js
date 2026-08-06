/**
 * Room Allocation Model
 * Student room assignment tracking.
 *
 * IMPORTANT: Room.occupancy and StudentProfile.currentRoomAllocation are
 * maintained EXCLUSIVELY by the room owner service
 * (src/services/hostel/roomOwner.service.js), which performs every allocation
 * write atomically and transactionally. This model intentionally has NO
 * lifecycle hooks — a raw Mongoose write here will NOT adjust occupancy or the
 * student's current-allocation pointer. All allocation changes must go through
 * roomOwner.
 *
 * The { roomId, bedNumber } index is UNIQUE — one student per bed, enforced at
 * the database level. Before enabling this in an environment with historical
 * data, run scripts/migrate_room_occupancy.mjs --apply --dedupe --build-index to
 * clean duplicate beds and build the unique index (otherwise the autoIndex build
 * fails on existing duplicates).
 */

import mongoose from "mongoose"

const RoomAllocationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" },
    bedNumber: { type: Number, required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

RoomAllocationSchema.index({ roomId: 1, bedNumber: 1 }, { unique: true })
RoomAllocationSchema.index({ studentProfileId: 1 })
RoomAllocationSchema.index({ userId: 1 })
RoomAllocationSchema.index({ hostelId: 1 })

RoomAllocationSchema.virtual("room", {
  ref: "Room",
  localField: "roomId",
  foreignField: "_id",
  justOne: true,
})

RoomAllocationSchema.virtual("displayRoomNumber").get(function () {
  if (!this.room) return ""

  if (this.room.unitId && typeof this.room.unitId === "object" && this.room.unitId.unitNumber) {
    // For unit-based hostels: <unit><room>-<bed>
    return `${this.room.unitId.unitNumber}${this.room.roomNumber}-${this.bedNumber}`
  } else {
    // For room-only hostels: <room>-<bed>
    return `${this.room.roomNumber}-${this.bedNumber}`
  }
})

const RoomAllocation = mongoose.model("RoomAllocation", RoomAllocationSchema)
export default RoomAllocation
