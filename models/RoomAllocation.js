import mongoose from "mongoose"

const RoomAllocationSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  studentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  bedNumber: { type: Number, required: true }, // 1, 2, 3, etc. for student position in multi-occupancy rooms
  allocationDate: { type: Date, default: Date.now },
  vacatedDate: { type: Date },
  status: { type: String, enum: ["Active", "Vacated", "Temporary"], default: "Active" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// Ensure a student can't be allocated to multiple rooms when active
RoomAllocationSchema.index(
  { studentId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "Active" },
  }
)

// Ensure unique bed assignments within a room
RoomAllocationSchema.index(
  { roomId: 1, bedNumber: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "Active" },
  }
)

RoomAllocationSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const RoomAllocation = mongoose.model("RoomAllocation", RoomAllocationSchema)
export default RoomAllocation
