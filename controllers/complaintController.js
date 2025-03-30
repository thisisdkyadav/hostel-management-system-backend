import mongoose from "mongoose"
import Complaint from "../models/Complaint.js"
import Unit from "../models/Unit.js"
import Room from "../models/Room.js"
import MaintenanceStaff from "../models/MaintenanceStaff.js"
import Warden from "../models/Warden.js"
import AssociateWarden from "../models/AssociateWarden.js"

export const createComplaint = async (req, res) => {
  const { userId, title, description, category, priority, hostelId, unit, room, attachments } = req.body
  try {
    console.log("Creating complaint with data:", req.body)

    const studentUnit = await Unit.findOne({ unitNumber: unit, hostelId })

    if (!studentUnit) {
      return res.status(404).json({ message: "Unit not found" })
    }

    const studentRoom = await Room.findOne({ unitId: studentUnit._id, hostelId, roomNumber: room })
    if (!studentRoom) {
      return res.status(404).json({ message: "Room not found" })
    }

    const newComplaint = new Complaint({
      userId,
      title,
      description,
      category,
      priority,
      hostelId,
      unitId: studentUnit._id,
      roomId: studentRoom._id,
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
  console.log("Fetching all complaints with query:", req.query)

  try {
    const user = req.user

    console.log("Fetching complaints for user:", user)

    const { role } = user
    const { page = 1, limit = 10, category, status, priority, hostelId, startDate, endDate } = req.query

    const query = {}

    if (["Student"].includes(role)) {
      query.userId = user._id
    } else if (["Maintenance Staff"].includes(role)) {
      const staffProfile = await MaintenanceStaff.findOne({ userId: user._id })
      if (staffProfile && staffProfile.category) {
        query.category = staffProfile.category
      }
      query.$or = [{ assignedTo: user._id }, { assignedTo: { $exists: false } }, { assignedTo: null }]
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

    if (priority) {
      query.priority = priority
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
      .populate("userId", "name email phone profileImage")
      .populate("hostelId", "name")
      .populate("unitId", "unitNumber")
      .populate("roomId", "roomNumber")
      .populate("assignedTo", "name email phone profileImage")
      .populate("resolvedBy", "name")
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
        priority: complaint.priority,
        hostel: complaint.hostelId ? complaint.hostelId.name : "N/A",
        roomNumber: roomNumber,
        reportedBy: {
          id: complaint.userId._id,
          email: complaint.userId.email,
          name: complaint.userId.name,
          profileImage: complaint.userId.profileImage || null,
          phone: complaint.userId.phone || "N/A",
        },
        assignedTo: complaint.assignedTo
          ? {
              id: complaint.assignedTo._id,
              email: complaint.assignedTo.email,
              name: complaint.assignedTo.name,
              profileImage: complaint.assignedTo.profileImage || null,
              phone: complaint.assignedTo.phone || "N/A",
            }
          : null,
        resolutionNotes: complaint.resolutionNotes || "",
        images: complaint.attachments || [],
        createdDate: complaint.createdAt.toISOString(),
        lastUpdated: complaint.updatedAt.toISOString(),
        feedback: complaint.feedback || "",
        feedbackRating: complaint.feedbackRating || null,
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

    console.log("Fetching stats for user:", user._id)

    const { role } = user

    const query = {}

    if (role === "Maintenance Staff") {
      const staffProfile = await MaintenanceStaff.findOne({ userId: user._id })
      if (staffProfile && staffProfile.category) {
        query.category = staffProfile.category
      }
    }

    const total = await Complaint.countDocuments(query)
    const pending = await Complaint.countDocuments({ ...query, status: "Pending" })
    const inProgress = await Complaint.countDocuments({ ...query, status: "In Progress" })
    const resolved = await Complaint.countDocuments({ ...query, status: "Resolved" })

    res.status(200).json({
      total,
      pending,
      inProgress,
      resolved,
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Error fetching stats", error: error.message })
  }
}
