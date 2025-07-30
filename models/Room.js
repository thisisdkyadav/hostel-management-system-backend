import mongoose from "mongoose"

const RoomSchema = new mongoose.Schema(
  {
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" }, // Optional, only for unit-based hostels
    roomNumber: { type: String, required: true }, // For unit-based: A, B, C... For room-only: 101, 102...
    capacity: { type: Number, required: true, default: 1 },
    occupancy: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
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

RoomSchema.statics.deactivateRoom = async function (roomId) {
  const room = await this.findById(roomId)
  if (!room) return null

  room.originalCapacity = room.capacity
  room.capacity = 0
  room.status = "Inactive"
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

RoomSchema.statics.deactivateRooms = async function (roomIds) {
  // First, get all rooms to preserve originalCapacity values
  const rooms = await this.find({ _id: { $in: roomIds } })

  // Prepare bulk update operations
  const bulkOps = rooms.map((room) => ({
    updateOne: {
      filter: { _id: room._id },
      update: {
        $set: {
          originalCapacity: room.capacity,
          capacity: 0,
          occupancy: 0,
          status: "Inactive",
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
