import CheckInOut from "../models/CheckInOut.js"
import StudentProfile from "../models/StudentProfile.js"
import { getIO } from "../config/socket.js"
import * as liveCheckInOutService from "./liveCheckInOutService.js"

/**
 * Scanner Action Service
 * Handles actions performed by different scanner types
 */

/**
 * Process student entry via hostel gate scanner
 * @param {Object} scanner - Scanner data from request
 * @param {string} rollNumber - Student roll number
 * @returns {Promise<Object>} Entry result
 */
export const processHostelGateEntry = async (scanner, rollNumber) => {
  // Find student by roll number
  const studentProfile = await StudentProfile.findOne({
    rollNumber: { $regex: new RegExp(`^${rollNumber}$`, "i") },
  })
    .populate({
      path: "userId",
      select: "name email phone profileImage",
    })
    .populate({
      path: "currentRoomAllocation",
      populate: [
        {
          path: "roomId",
          select: "roomNumber",
          populate: {
            path: "unitId",
            select: "unitNumber",
          },
        },
        {
          path: "hostelId",
          select: "name type",
        },
      ],
    })

  if (!studentProfile) {
    return {
      success: false,
      status: 404,
      message: "Student not found with this roll number",
    }
  }

  if (!studentProfile.userId) {
    return {
      success: false,
      status: 404,
      message: "Student user account not found",
    }
  }

  // Check if student has room allocation
  const allocation = studentProfile.currentRoomAllocation
  if (!allocation) {
    return {
      success: false,
      status: 400,
      message: "Student does not have a room allocation",
    }
  }

  // Determine status based on scanner direction
  const status = scanner.direction === "in" ? "Checked In" : "Checked Out"

  // Gate hostel (where scanner is located)
  const gateHostelId = scanner.hostelId?._id || scanner.hostelId

  // Student's hostel (from allocation)
  const studentHostelId = allocation.hostelId?._id || allocation.hostelId
  const studentHostelName = allocation.hostelId?.name || ""

  // Check if same hostel
  const isSameHostel = gateHostelId && studentHostelId
    ? gateHostelId.toString() === studentHostelId.toString()
    : false

  // Build room info
  const unit = allocation.roomId?.unitId?.unitNumber || ""
  const room = allocation.roomId?.roomNumber || ""
  const bed = allocation.bedNumber?.toString() || ""

  // Create check-in/out entry
  const entry = new CheckInOut({
    userId: studentProfile.userId._id,
    hostelId: gateHostelId,
    hostelName: studentHostelName,
    room,
    unit,
    bed,
    dateAndTime: new Date(),
    isSameHostel,
    status,
  })

  await entry.save()

  // Emit real-time event
  const io = getIO()
  await liveCheckInOutService.emitNewEntryEvent(io, entry)

  // Format response
  const displayRoom = unit ? `${unit}-${room}-${bed}` : `${room}-${bed}`

  return {
    success: true,
    status: 201,
    message: `Student ${status.toLowerCase()} successfully`,
    data: {
      entry: {
        _id: entry._id,
        status: entry.status,
        dateAndTime: entry.dateAndTime,
        isSameHostel: entry.isSameHostel,
      },
      student: {
        name: studentProfile.userId.name,
        rollNumber: studentProfile.rollNumber,
        profileImage: studentProfile.userId.profileImage,
        hostel: studentHostelName,
        room: displayRoom,
      },
    },
  }
}

export default {
  processHostelGateEntry,
}
