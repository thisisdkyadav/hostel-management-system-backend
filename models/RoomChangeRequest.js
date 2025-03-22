import mongoose from "mongoose"

const RoomChangeRequestSchema = new mongoose.Schema({
  // Student requesting the change
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // Student profile for additional details
  studentProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StudentProfile",
    required: true,
  },

  // Current room allocation
  currentAllocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoomAllocation",
    required: true,
  },

  // Requested room and bed
  requestedUnitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
  },

  // Requested room and bed
  requestedRoomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Room",
    required: true,
  },

  // Reason for room change
  reason: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
    maxlength: 1000,
  },

  // Request status
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },

  // New allocation reference (after implementation)
  newAllocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoomAllocation",
  },
})

// Update timestamp before save
RoomChangeRequestSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const RoomChangeRequest = mongoose.model("RoomChangeRequest", RoomChangeRequestSchema)
export default RoomChangeRequest
