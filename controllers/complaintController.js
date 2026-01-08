import e from "express"
import Complaint from "../models/Complaint.js"
import RoomAllocation from "../models/RoomAllocation.js"

export const createComplaint = async (req, res) => {
  const user = req.user
  const { role } = user
  const { userId, title, description, location, category, attachments } = req.body
  try {
    let allocationDetails = null
    if (["Student"].includes(role)) {
      allocationDetails = await RoomAllocation.findOne({ userId })

      if (!allocationDetails) {
        return res.status(404).json({ message: "Room allocation not found" })
      }
    } else if (user.hostel) {
      allocationDetails = { hostelId: user.hostel._id }
    }

    const newComplaint = new Complaint({
      userId,
      title,
      description,
      location,
      category,
      hostelId: allocationDetails?.hostelId,
      unitId: allocationDetails?.unitId,
      roomId: allocationDetails?.roomId,
      attachments,
    })

    await newComplaint.save()

    res.status(201).json({ message: "Complaint created successfully" })
  } catch (error) {
    console.error("Error creating complaint:", error)
    res.status(500).json({ message: "Error creating complaint", error: error.message })
  }
}

export const getAllComplaints = async (req, res) => {
  try {
    const user = req.user
    const { role } = user
    const { page = 1, limit = 10, category, status, hostelId, startDate, endDate, feedbackRating, satisfactionStatus } = req.query

    const query = {}

    if (["Student"].includes(role)) {
      query.userId = user._id
    }

    if (user.hostel) {
      query.hostelId = user.hostel._id
    } else if (hostelId && ["Admin", "Maintenance Staff"].includes(role)) {
      query.hostelId = hostelId
    }

    if (category) {
      query.category = category
    }

    if (status) {
      query.status = status
    }

    if (feedbackRating) {
      query.feedbackRating = Number(feedbackRating)
    }

    if (satisfactionStatus) {
      query.satisfactionStatus = satisfactionStatus
    }

    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) {
        query.createdAt.$gte = new Date(startDate)
      }
      if (endDate) {
        const endDateObj = new Date(endDate)
        endDateObj.setDate(endDateObj.getDate() + 1)
        query.createdAt.$lte = endDateObj
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit)
    const limitNum = parseInt(limit)

    const totalCount = await Complaint.countDocuments(query)

    const complaints = await Complaint.find(query)
      .populate("userId", "name email phone profileImage role")
      .populate("hostelId", "name")
      .populate("unitId", "unitNumber")
      .populate("roomId", "roomNumber")
      .populate("assignedTo", "name email phone profileImage")
      .populate("resolvedBy", "name email phone profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)

    const formattedComplaints = complaints.map((complaint) => {
      let roomNumber = ""
      if (complaint.unitId && complaint.roomId) {
        roomNumber = `${complaint.unitId.unitNumber}-${complaint.roomId.roomNumber}`
      } else if (complaint.roomId) {
        roomNumber = complaint.roomId.roomNumber
      }

      return {
        id: complaint._id,
        title: complaint.title,
        description: complaint.description,
        status: complaint.status,
        category: complaint.category,

        hostel: complaint.hostelId ? complaint.hostelId.name : null,
        roomNumber: roomNumber,
        location: complaint.location,
        reportedBy: {
          id: complaint.userId._id,
          email: complaint.userId.email,
          name: complaint.userId.name,
          profileImage: complaint.userId.profileImage || null,
          phone: complaint.userId.phone || null,
          role: complaint.userId.role,
        },
        assignedTo: complaint.assignedTo
          ? {
              id: complaint.assignedTo._id,
              email: complaint.assignedTo.email,
              name: complaint.assignedTo.name,
              profileImage: complaint.assignedTo.profileImage || null,
              phone: complaint.assignedTo.phone || null,
            }
          : null,
        resolvedBy: complaint.resolvedBy
          ? {
              id: complaint.resolvedBy._id,
              email: complaint.resolvedBy.email,
              name: complaint.resolvedBy.name,
              profileImage: complaint.resolvedBy.profileImage || null,
              phone: complaint.resolvedBy.phone || null,
            }
          : null,
        resolutionNotes: complaint.resolutionNotes || "",
        images: complaint.attachments || [],
        createdDate: complaint.createdAt.toISOString(),
        lastUpdated: complaint.updatedAt.toISOString(),
        feedback: complaint.feedback || "",
        feedbackRating: complaint.feedbackRating || null,
        satisfactionStatus: complaint.satisfactionStatus || null,
        resolutionDate: complaint.resolutionDate ? complaint.resolutionDate.toISOString() : null,
      }
    })

    res.status(200).json({
      data: formattedComplaints || [],
      meta: {
        total: totalCount,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limitNum),
      },
      message: "Complaints fetched successfully",
      status: "success",
    })
  } catch (error) {
    console.error("Error fetching complaints:", error)
    res.status(500).json({
      message: "Error fetching complaints",
      error: error.message,
      status: "error",
    })
  }
}

export const getComplaintById = async (req, res) => {
  const { id } = req.params
  const user = req.user
  try {
    const complaint = await Complaint.findById(id)
      .populate("userId", "name email phone profileImage role")
      .populate("hostelId", "name")
      .populate("unitId", "unitNumber")
      .populate("roomId", "roomNumber")
      .populate("assignedTo", "name email phone profileImage")
      .populate("resolvedBy", "name email phone profileImage")
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }

    if (user.hostel && !["Admin", "Maintenance Staff"].includes(user.role) && complaint.hostelId.toString() !== user.hostel._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to access this complaint" })
    }

    if (["Student"].includes(user.role) && complaint.userId.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to access this complaint" })
    }

    res.status(200).json({ message: "Complaint fetched successfully", data: complaint })
  } catch (error) {
    console.error("Error fetching complaint:", error)
  }
}

export const updateComplaintStatus = async (req, res) => {
  const { id } = req.params
  const { status, assignedTo, resolutionNotes, feedback, feedbackRating } = req.body

  try {
    const complaint = await Complaint.findByIdAndUpdate(
      id,
      {
        status,
        assignedTo,
        resolutionNotes,
        feedback,
        feedbackRating,
        resolutionDate: status === "Resolved" ? new Date() : null,
      },
      { new: true }
    )

    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    res.status(200).json({ message: "Complaint updated successfully", data: complaint })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Error updating complaint", error: error.message })
  }
}

export const getStats = async (req, res) => {
  try {
    const user = req.user
    const { role } = user
    const { hostelId } = req.query
    const query = {}

    if (["Student"].includes(role)) {
      query.userId = user._id
    }

    if (user.hostel) {
      query.hostelId = user.hostel._id
    } else if (hostelId && ["Admin", "Maintenance Staff"].includes(role)) {
      query.hostelId = hostelId
    }

    const total = await Complaint.countDocuments(query)
    const pending = await Complaint.countDocuments({ ...query, status: "Pending" })
    const inProgress = await Complaint.countDocuments({ ...query, status: "In Progress" })
    const resolved = await Complaint.countDocuments({ ...query, status: "Resolved" })
    const forwardedToIDO = await Complaint.countDocuments({ ...query, status: "Forwarded to IDO" })

    res.status(200).json({
      total,
      pending,
      inProgress,
      resolved,
      forwardedToIDO,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Error fetching stats", error: error.message })
  }
}

export const getStudentComplaints = async (req, res) => {
  const { userId } = req.params
  const { page = 1, limit = 10 } = req.query
  try {
    const skip = (parseInt(page) - 1) * parseInt(limit)
    const limitNum = parseInt(limit)

    const totalCount = await Complaint.countDocuments({ userId })

    const complaints = await Complaint.find({ userId })
      .populate("userId", "name email phone profileImage role")
      .populate("hostelId", "name")
      .populate("unitId", "unitNumber")
      .populate("roomId", "roomNumber")
      .populate("assignedTo", "name email phone profileImage")
      .populate("resolvedBy", "name email phone profileImage")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
    const formattedComplaints = complaints.map((complaint) => {
      let roomNumber = ""
      if (complaint.unitId && complaint.roomId) {
        roomNumber = `${complaint.unitId.unitNumber}-${complaint.roomId.roomNumber}`
      } else if (complaint.roomId) {
        roomNumber = complaint.roomId.roomNumber
      } else {
        roomNumber = "N/A"
      }

      return {
        id: complaint._id,
        title: complaint.title,
        description: complaint.description,
        status: complaint.status,
        category: complaint.category,

        hostel: complaint.hostelId ? complaint.hostelId.name : "N/A",
        roomNumber: roomNumber,
        location: complaint.location,
        reportedBy: {
          id: complaint.userId._id,
          email: complaint.userId.email,
          name: complaint.userId.name,
          profileImage: complaint.userId.profileImage || null,
          phone: complaint.userId.phone || null,
        },
        assignedTo: complaint.assignedTo
          ? {
              id: complaint.assignedTo._id,
              email: complaint.assignedTo.email,
              name: complaint.assignedTo.name,
              profileImage: complaint.assignedTo.profileImage || null,
              phone: complaint.assignedTo.phone || null,
            }
          : null,
        resolvedBy: complaint.resolvedBy
          ? {
              id: complaint.resolvedBy._id,
              email: complaint.resolvedBy.email,
              name: complaint.resolvedBy.name,
              profileImage: complaint.resolvedBy.profileImage || null,
              phone: complaint.resolvedBy.phone || null,
            }
          : null,
        resolutionNotes: complaint.resolutionNotes || "",
        images: complaint.attachments || [],
        createdDate: complaint.createdAt.toISOString(),
        lastUpdated: complaint.updatedAt.toISOString(),
        feedback: complaint.feedback || "",
        feedbackRating: complaint.feedbackRating || null,
        satisfactionStatus: complaint.satisfactionStatus || null,
        resolutionDate: complaint.resolutionDate ? complaint.resolutionDate.toISOString() : null,
      }
    })

    res.status(200).json({
      data: formattedComplaints || [],
      meta: {
        total: totalCount,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limitNum),
      },
      message: "Student complaints fetched successfully",
    })
  } catch (error) {
    console.error("Error fetching student complaints:", error)
    res.status(500).json({ message: "Error fetching student complaints", error: error.message })
  }
}

export const complaintStatusUpdate = async (req, res) => {
  const { complaintId } = req.params
  const { status } = req.body
  const user = req.user
  try {
    let complaint
    if (status === "Resolved") {
      const date = new Date()
      complaint = await Complaint.findByIdAndUpdate(complaintId, { status, resolvedBy: user._id, resolutionDate: date }, { new: true })
    } else {
      complaint = await Complaint.findByIdAndUpdate(complaintId, { status }, { new: true })
    }

    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    res.status(200).json({ message: "Complaint status updated successfully", data: complaint })
  } catch (error) {
    console.error("Error updating complaint status:", error)
    res.status(500).json({ message: "Error updating complaint status", error: error.message })
  }
}

export const updateComplaintResolutionNotes = async (req, res) => {
  const { complaintId } = req.params
  const { resolutionNotes } = req.body
  try {
    const complaint = await Complaint.findByIdAndUpdate(complaintId, { resolutionNotes }, { new: true })
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    res.status(200).json({ message: "Complaint resolution notes updated successfully", data: complaint })
  } catch (error) {
    console.error("Error updating complaint resolution notes:", error)
    res.status(500).json({ message: "Error updating complaint resolution notes", error: error.message })
  }
}

export const updateComplaintFeedback = async (req, res) => {
  const user = req.user
  const { complaintId } = req.params
  const { feedback, feedbackRating, satisfactionStatus } = req.body
  try {
    // if the user is not the one who filed the complaint, return 403
    const existingComplaint = await Complaint.findById(complaintId)
    if (!existingComplaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    if (existingComplaint.userId.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to update feedback for this complaint" })
    }
    const complaint = await Complaint.findByIdAndUpdate(complaintId, { feedback, feedbackRating, satisfactionStatus }, { new: true })
    if (!complaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    res.status(200).json({ message: "Complaint feedback updated successfully", data: complaint })
  } catch (error) {
    console.error("Error updating complaint feedback:", error)
    res.status(500).json({ message: "Error updating complaint feedback", error: error.message })
  }
}
