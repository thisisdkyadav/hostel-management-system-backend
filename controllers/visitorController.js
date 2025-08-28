import mongoose from "mongoose"
import VisitorRequest from "../models/VisitorRequest.js"
import Unit from "../models/Unit.js"
import Room from "../models/Room.js"
import StudentProfile from "../models/StudentProfile.js"
import { createPaymentLink, checkPaymentStatus } from "../utils/utils.js"

export const createVisitorRequest = async (req, res) => {
  const { visitors, reason, fromDate, toDate, h2FormUrl } = req.body
  const user = req.user

  try {
    const visitorRequest = new VisitorRequest({
      visitors,
      reason,
      fromDate,
      toDate,
      userId: user._id,
      h2FormUrl,
    })

    await visitorRequest.save()
    res.status(201).json({ message: "Visitor request submitted successfully", visitorRequest, success: true })
  } catch (error) {
    console.error("Error submitting visitor request:", error)
    res.status(500).json({ message: "Error submitting visitor request", error: error.message })
  }
}

export const getVisitorRequests = async (req, res) => {
  const user = req.user
  try {
    const query = {}

    if (user.role === "Student") {
      query.userId = user._id
    } else if (user.hostel) {
      query.hostelId = user.hostel._id
    }
    // newest first
    const visitorRequests = await VisitorRequest.find(query).sort({ createdAt: -1 }).populate("userId", "name email profileImage").populate("visitors")

    const formattedRequests = visitorRequests.map((request) => {
      const visitorCount = request.visitors.length
      const visitorNames = request.visitors.map((visitor) => visitor.name).join(", ")
      const isAllocated = request.allocatedRooms && request.allocatedRooms.length > 0
      const studentProfile = request.userId ? request.userId : null
      const studentName = studentProfile ? studentProfile.name : ""
      const studentEmail = studentProfile ? studentProfile.email : ""
      const studentProfileImage = studentProfile ? studentProfile.profileImage : null
      const h2FormUrl = request.h2FormUrl ? request.h2FormUrl : null

      return {
        ...request._doc,
        visitorCount,
        visitorNames,
        isAllocated,
        studentName,
        studentEmail,
        studentProfileImage,
        h2FormUrl,
      }
    })

    res.status(200).json({
      message: "Visitor requests fetched successfully",
      success: true,
      data: formattedRequests || [],
    })
  } catch (error) {
    console.error("Error fetching visitor requests:", error)
    res.status(500).json({
      message: "Error fetching visitor requests",
      error: error.message,
    })
  }
}

export const getVisitorRequestById = async (req, res) => {
  const { requestId } = req.params

  try {
    const visitorRequest = await VisitorRequest.findById(requestId)
      .populate("userId", "name email profileImage")
      .populate("visitors")
      .populate({
        path: "allocatedRooms",
        populate: {
          path: "unitId",
          select: "unitNumber",
        },
      })
      .populate("hostelId", "name")

    if (!visitorRequest) {
      return res.status(404).json({
        message: "Visitor request not found",
        success: false,
      })
    }

    let studentProfile = null
    if (visitorRequest.userId) {
      try {
        studentProfile = await StudentProfile.getFullStudentData(visitorRequest.userId._id)
      } catch (err) {
        console.error("Error fetching student profile:", err)
      }
    }

    const rooms = visitorRequest.allocatedRooms.map((room) => {
      const unit = room.unitId ? room.unitId.unitNumber : null
      const roomNumber = room.roomNumber ? room.roomNumber : null
      return unit ? [roomNumber, unit] : [roomNumber]
    })

    const visitorCount = visitorRequest.visitors.length
    const visitorNames = visitorRequest.visitors.map((visitor) => visitor.name).join(", ")
    const isAllocated = visitorRequest.allocatedRooms && visitorRequest.allocatedRooms.length > 0
    const h2FormUrl = visitorRequest.h2FormUrl ? visitorRequest.h2FormUrl : null

    const paymentStatus = (await checkPaymentStatus(visitorRequest.paymentId)) || null

    // Construct the formatted response
    const formattedRequest = {
      _id: visitorRequest._id,
      studentId: visitorRequest.userId?._id,
      studentProfileImage: visitorRequest.userId?.profileImage || null,
      studentName: visitorRequest.userId?.name || "",
      studentEmail: visitorRequest.userId?.email || "",
      studentHostel: studentProfile?.hostel || "",
      studentDisplayRoom: studentProfile?.displayRoom || "",
      visitors: visitorRequest.visitors,
      visitorCount,
      visitorNames,
      fromDate: visitorRequest.fromDate,
      toDate: visitorRequest.toDate,
      reason: visitorRequest.reason,
      status: visitorRequest.status,
      isAllocated,
      allocatedRooms: rooms || [],
      approveInfo: visitorRequest.approveInfo || null,
      rejectionReason: visitorRequest.reasonForRejection || null,
      hostelId: visitorRequest.hostelId?._id || null,
      hostelName: visitorRequest.hostelId?.name || null,
      rejectionReason: visitorRequest.reasonForRejection || null,
      checkInTime: visitorRequest.checkInTime || null,
      checkOutTime: visitorRequest.checkOutTime || null,
      securityNotes: visitorRequest.securityNotes || null,
      createdAt: visitorRequest.createdAt,
      paymentLink: visitorRequest.paymentLink || null,
      paymentId: visitorRequest.paymentId || null,
      paymentStatus,
      h2FormUrl,
    }

    res.status(200).json({
      message: "Visitor request fetched successfully",
      success: true,
      data: formattedRequest,
    })
  } catch (error) {
    console.error("Error fetching visitor request:", error)
    res.status(500).json({
      message: "Error fetching visitor request",
      error: error.message,
    })
  }
}

export const updateVisitorRequest = async (req, res) => {
  const { requestId } = req.params
  const { reason, fromDate, toDate, h2FormUrl } = req.body

  try {
    const request = await VisitorRequest.findById(requestId)
    if (!request) {
      return res.status(404).json({
        message: "Visitor request not found",
        success: false,
      })
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        message: "Cannot update a request that is not pending",
        success: false,
      })
    }

    const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { reason, fromDate, toDate, h2FormUrl }, { new: true })

    res.status(200).json({
      message: `Visitor request updated successfully`,
      success: true,
      updatedRequest,
    })
  } catch (error) {
    console.error("Error updating visitor request status:", error)
    res.status(500).json({
      message: "Error updating visitor request status",
      error: error.message,
    })
  }
}

export const deleteVisitorRequest = async (req, res) => {
  const { requestId } = req.params

  try {
    const deletedRequest = await VisitorRequest.findByIdAndDelete(requestId)

    if (!deletedRequest) {
      return res.status(404).json({
        message: "Visitor request not found",
        success: false,
      })
    }

    res.status(200).json({
      message: "Visitor request deleted successfully",
      success: true,
    })
  } catch (error) {
    console.error("Error deleting visitor request:", error)
    res.status(500).json({
      message: "Error deleting visitor request",
      error: error.message,
    })
  }
}

export const updateVisitorRequestStatus = async (req, res) => {
  const { requestId, action } = req.params
  const { reason, hostelId: assignedHostelId, amount, approvalInformation } = req.body

  try {
    if (action !== "approve" && action !== "reject") {
      return res.status(400).json({
        message: "Invalid action",
        success: false,
      })
    }
    const status = action === "approve" ? "Approved" : "Rejected"
    const reasonForRejection = action === "reject" ? reason : undefined
    const hostelId = action === "approve" ? assignedHostelId : undefined
    const approveInfo = action === "approve" ? approvalInformation : undefined
    let paymentLink = null
    let paymentId = null
    // if (action === "approve") {
    //   const paymentData = await createPaymentLink(amount)
    //   paymentLink = paymentData.paymentLink
    //   paymentId = paymentData.paymentId
    //   console.log(paymentLink, paymentId)
    // }

    const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { status, reasonForRejection, hostelId, approveInfo }, { new: true })

    if (!updatedRequest) {
      return res.status(404).json({
        message: "Visitor request not found",
        success: false,
      })
    }

    res.status(200).json({
      message: `Visitor request status updated to ${status}`,
      success: true,
      updatedRequest,
    })
  } catch (error) {
    console.error("Error updating visitor request status:", error)
    res.status(500).json({
      message: "Error updating visitor request status",
      error: error.message,
    })
  }
}

export const allocateRoomsToVisitorRequest = async (req, res) => {
  const { requestId } = req.params
  const { allocationData } = req.body
  const user = req.user

  const session = await mongoose.startSession()

  try {
    const updatedRequest = await session.withTransaction(async () => {
      const hostelId = user.hostel._id

      const allocatedRoomIds = await Promise.all(
        allocationData.map(async (room) => {
          const roomNumber = room[0]
          const unitNumber = room[1] ? room[1] : undefined

          let unitId
          if (unitNumber) {
            const unit = await Unit.findOne({ unitNumber, hostelId }).session(session)
            if (!unit) {
              throw new Error(`Unit ${unitNumber} not found in hostel ${user.hostel.name}`)
            }
            unitId = unit._id
          }

          const foundRoom = await Room.findOne({ roomNumber, unitId, hostelId }).session(session)
          if (!foundRoom) {
            throw new Error(`Room ${roomNumber} not found in unit ${unitNumber}`)
          }
          if (foundRoom.occupancy) {
            throw new Error(`Room ${roomNumber} in unit ${unitNumber} is already occupied by a student`)
          }
          return foundRoom._id
        })
      )

      const updatedReq = await VisitorRequest.findByIdAndUpdate(requestId, { allocatedRooms: allocatedRoomIds }, { new: true, session })

      if (!updatedReq) {
        throw new Error("Visitor request not found")
      }

      return updatedReq
    })

    res.status(200).json({
      message: "Rooms allocated successfully",
      success: true,
      updatedRequest,
    })
  } catch (error) {
    console.error("Error allocating rooms to visitor request:", error)
    res.status(500).json({
      message: "Error allocating rooms to visitor request",
      error: error.message,
    })
  } finally {
    session.endSession()
  }
}

export const checkInVisitor = async (req, res) => {
  const { requestId } = req.params
  const { checkInTime, notes: securityNotes } = req.body
  const user = req.user

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { checkInTime, securityNotes }, { new: true, session })

    if (!updatedRequest) {
      throw new Error("Visitor request not found")
    }

    await session.commitTransaction()
    res.status(200).json({
      message: "Check-in successful",
      success: true,
      updatedRequest,
    })
  } catch (error) {
    console.error("Error checking in visitor:", error)
    await session.abortTransaction()
    res.status(500).json({
      message: "Error checking in visitor",
      error: error.message,
    })
  } finally {
    session.endSession()
  }
}
export const checkOutVisitor = async (req, res) => {
  const { requestId } = req.params
  const { checkOutTime, notes: securityNotes } = req.body
  const user = req.user

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { checkOutTime, securityNotes }, { new: true, session })

    if (!updatedRequest) {
      throw new Error("Visitor request not found")
    }

    await session.commitTransaction()
    res.status(200).json({
      message: "Check-out successful",
      success: true,
      updatedRequest,
    })
  } catch (error) {
    console.error("Error checking out visitor:", error)
    await session.abortTransaction()
    res.status(500).json({
      message: "Error checking out visitor",
      error: error.message,
    })
  } finally {
    session.endSession()
  }
}
export const updateCheckTime = async (req, res) => {
  console.log("updateCheckTime called")

  const { requestId } = req.params
  const { checkInTime, checkOutTime, notes: securityNotes } = req.body
  const user = req.user

  try {
    const updatedRequest = await VisitorRequest.findByIdAndUpdate(requestId, { checkInTime, checkOutTime, securityNotes }, { new: true })

    if (!updatedRequest) {
      return res.status(404).json({
        message: "Visitor request not found",
        success: false,
      })
    }

    res.status(200).json({
      message: "Check-in/out time updated successfully",
      success: true,
      updatedRequest,
    })
  } catch (error) {
    console.error("Error updating check-in/out time:", error)
    res.status(500).json({
      message: "Error updating check-in/out time",
      error: error.message,
    })
  }
}

export const getStudentVisitorRequests = async (req, res) => {
  const { userId } = req.params

  try {
    const visitorRequests = await VisitorRequest.find({ userId }).populate("userId", "name email profileImage").populate("visitors")

    const formattedRequests = visitorRequests.map((request) => {
      const visitorCount = request.visitors.length
      const visitorNames = request.visitors.map((visitor) => visitor.name).join(", ")
      const isAllocated = request.allocatedRooms && request.allocatedRooms.length > 0

      return {
        ...request._doc,
        visitorCount,
        visitorNames,
        isAllocated,
      }
    })

    res.status(200).json({
      message: "Visitor requests fetched successfully",
      success: true,
      data: formattedRequests || [],
    })
  } catch (error) {
    console.error("Error fetching student visitor requests:", error)
    res.status(500).json({
      message: "Error fetching student visitor requests",
      error: error.message,
    })
  }
}
