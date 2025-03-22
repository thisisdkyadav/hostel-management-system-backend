import Complaint from "../models/Complaint.js"

export const createComplaint = async (req, res) => {
  try {
    const { userId, title, description, status, category, priority, location, hostelId, unitId, roomId, attachments } = req.body

    const newComplaint = new Complaint({
      userId,
      title,
      description,
      status,
      category,
      priority,
      location,
      hostelId,
      unitId,
      roomId,
      attachments,
    })

    await newComplaint.save()

    res.status(201).json({ message: "Complaint created successfully", complaint: newComplaint })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Error creating complaint", error: error.message })
  }
}

export const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({})
      .populate("userId", "name email phone profilePic")
      .populate("hostelId", "name")
      .populate("unitId", "unitNumber")
      .populate("roomId", "roomNumber")
      .populate("assignedTo", "name email phone profilePic")
      .populate("resolvedBy", "name")
      .sort({ createdAt: -1 })

    const formattedComplaints = complaints.map((complaint) => {
      // Format room number display
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
          email: complaint.userId.email,
          name: complaint.userId.name,
          image: complaint.userId.profilePic || null,
          phone: complaint.userId.phone || "N/A",
        },
        assignedTo: complaint.assignedTo
          ? {
              email: complaint.assignedTo.email,
              name: complaint.assignedTo.name,
              image: complaint.assignedTo.profilePic || null,
              phone: complaint.assignedTo.phone || "N/A",
            }
          : null,
        resolutionNotes: complaint.resolutionNotes || "",
        images: complaint.attachments || [],
        createdDate: complaint.createdAt.toISOString(),
        lastUpdated: complaint.updatedAt.toISOString(),
        // Add additional fields as needed
        feedback: complaint.feedback || "",
        feedbackRating: complaint.feedbackRating || null,
        resolutionDate: complaint.resolutionDate ? complaint.resolutionDate.toISOString() : null,
      }
    })

    res.status(200).json(formattedComplaints)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Error fetching complaints", error: error.message })
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
    res.status(200).json({ message: "Complaint updated successfully", complaint })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Error updating complaint", error: error.message })
  }
}

export const getStats = async (req, res) => {
  try {
    const total = await Complaint.countDocuments()
    const pending = await Complaint.countDocuments({ status: "Pending" })
    const inProgress = await Complaint.countDocuments({ status: "In Progress" })
    const resolved = await Complaint.countDocuments({ status: "Resolved" })

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
