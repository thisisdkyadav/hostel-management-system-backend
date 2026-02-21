/**
 * Room Change Request Model
 * Student room change request tracking
 */

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

RoomChangeRequestSchema.statics.findRequestsWithFilters = async function (hostelId, options = {}) {
  const { page = 1, limit = 10, status = "Pending" } = options

  const matchStage = { hostelId: new mongoose.Types.ObjectId(hostelId) }

  if (["Pending", "Approved", "Rejected"].includes(status)) {
    matchStage.status = status
  }

  const skip = (parseInt(page) - 1) * parseInt(limit)
  const limitNum = parseInt(limit)

  const totalCount = await this.countDocuments(matchStage)

  const roomChangeRequests = await this.find(matchStage)
    .populate("userId", "name email")
    .populate("studentProfileId", "rollNumber department")
    .populate({
      path: "currentAllocationId",
      populate: {
        path: "roomId",
        model: "Room",
        populate: { path: "unitId" },
      },
    })
    .populate("requestedRoomId")
    .populate("requestedUnitId")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limitNum)

  const formattedRequests = roomChangeRequests.map((request) => ({
    id: request._id,
    student: {
      name: request.userId?.name,
      email: request.userId?.email,
      rollNumber: request.studentProfileId?.rollNumber,
      department: request.studentProfileId?.department,
    },
    currentRoom: {
      roomNumber: request.currentAllocationId?.roomId?.roomNumber || null,
      unitNumber: request.currentAllocationId?.roomId?.unitId?.unitNumber || null,
    },
    requestedRoom: {
      roomNumber: request.requestedRoomId?.roomNumber || null,
      unitNumber: request.requestedUnitId?.unitNumber || null,
    },
    reason: request.reason,
    status: request.status,
    createdAt: request.createdAt,
  }))

  return {
    data: formattedRequests,
    meta: {
      totalCount,
      currentPage: parseInt(page),
      totalPages: Math.ceil(totalCount / limitNum),
      limit: limitNum,
    },
  }
}

RoomChangeRequestSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

RoomChangeRequestSchema.index({ hostelId: 1, status: 1, createdAt: -1 })
RoomChangeRequestSchema.index({ userId: 1, createdAt: -1 })

const RoomChangeRequest = mongoose.model("RoomChangeRequest", RoomChangeRequestSchema)
export default RoomChangeRequest
