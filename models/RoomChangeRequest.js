import mongoose from "mongoose"

const RoomChangeRequestSchema = new mongoose.Schema({
  // Student requesting the change
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  // Hostel where the request is made
  hostelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hostel",
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
    ref: "Unit",
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
    maxlength: 1000,
  },

  // Request status
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },

  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 1000,
  },

  // New allocation reference (after implementation)
  newAllocationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoomAllocation",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

// Update timestamp before save
RoomChangeRequestSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const RoomChangeRequest = mongoose.model("RoomChangeRequest", RoomChangeRequestSchema)
export default RoomChangeRequest
