/**
 * Scanner Action Service
 * Handles actions performed by different scanner types
 */

import { CheckInOut } from "../models/index.js"
import { StudentProfile } from "../models/index.js"
import { getIO } from "../loaders/socket.loader.js"
import * as liveCheckInOutService from "./liveCheckInOut.service.js"

/**
 * Process student entry via hostel gate scanner
 * @param {Object} scanner - Scanner data from request
 * @param {Object} scanData - Scan data from device
 * @param {string} scanData.employeeID - Student roll number
 * @param {Date} scanData.dateTime - Date and time of scan
 * @param {string} scanData.direction - "in" or "out"
 * @param {string} scanData.modeofPunch - Mode of punch (Face, Fingerprint, etc)
 * @param {string} scanData.deviceID - Device ID
 * @returns {Promise<Object>} Entry result
 */
export const processHostelGateEntry = async (scanner, scanData) => {
  const { employeeID: rollNumber, dateTime, direction, modeofPunch, deviceID } = scanData

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
      message: `Student not found: ${rollNumber}`,
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

  // Determine status based on direction
  const status = direction === "in" ? "Checked In" : "Checked Out"

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

  // Check for duplicate entry (same student, same timestamp within 1 minute)
  const oneMinuteAgo = new Date(dateTime.getTime() - 60000)
  const existingEntry = await CheckInOut.findOne({
    userId: studentProfile.userId._id,
    dateAndTime: { $gte: oneMinuteAgo, $lte: dateTime },
    status: status,
  })

  // if (existingEntry) {
  //   // Duplicate detected, return success but don't create new entry
  //   return {
  //     success: true,
  //     status: 200,
  //     message: "Duplicate entry ignored",
  //   }
  // }

  // Create check-in/out entry
  const entry = new CheckInOut({
    userId: studentProfile.userId._id,
    hostelId: gateHostelId,
    hostelName: studentHostelName,
    room,
    unit,
    bed,
    dateAndTime: dateTime,
    isSameHostel,
    status
  })

  await entry.save()

  // Emit real-time event
  try {
    const io = getIO()
    await liveCheckInOutService.emitNewEntryEvent(io, entry)
  } catch (emitError) {
    console.error("Error emitting real-time event:", emitError)
    // Don't fail the request if socket emission fails
  }

  return {
    success: true,
    status: 201,
    message: `Student ${status.toLowerCase()} successfully`,
  }
}

export default {
  processHostelGateEntry,
}
