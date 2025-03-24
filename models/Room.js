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

// Compound index for room identification
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

RoomSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const Room = mongoose.model("Room", RoomSchema)
export default Room
