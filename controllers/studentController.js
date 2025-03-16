import StudentProfile from "../models/StudentProfile.js"
import Complaint from "../models/Complaint.js"
import Poll from "../models/Poll.js"
import RoomChangeRequest from "../models/RoomChangeRequest.js"
import RoomAllocation from "../models/RoomAllocation.js"
import Room from "../models/Room.js"
import LostAndFound from "../models/LostAndFound.js"

export const createStudentProfile = async (req, res) => {
  const { userId } = req.params
  try {
    const existingProfile = await StudentProfile.findOne({
      userId,
    })

    if (existingProfile) {
      return res.status(400).json({ message: "Profile already exists" })
    }

    const newProfile = new StudentProfile({ userId, ...req.body })
    await newProfile.save()
    res.status(201).json(newProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const getStudentProfile = async (req, res) => {
  const { userId } = req.params
  try {
    const studentProfile = await StudentProfile.findOne({ userId })
      .populate("userId", "name email role")
      .exec()
    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }
    res.status(200).json(studentProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const updateStudentProfile = async (req, res) => {
  const { userId } = req.params
  try {
    const updatedProfile = await StudentProfile.findOneAndUpdate(
      { userId },
      { $set: req.body },
      { new: true }
    )
    if (!updatedProfile) {
      return res.status(404).json({ message: "Profile update failed" })
    }
    res.status(200).json(updatedProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Request room change
export const requestRoomChange = async (req, res) => {
  const { userId } = req.params
  try {
    // Get student profile
    const studentProfile = await StudentProfile.findOne({ userId })
    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }

    // Get current room allocation
    const currentAllocation = await RoomAllocation.findOne({
      studentId: userId,
      status: "Active",
    })
    if (!currentAllocation) {
      return res.status(404).json({ message: "No active room allocation found" })
    }

    // Check if room change request already exists
    const existingRequest = await RoomChangeRequest.findOne({
      studentId: userId,
      status: { $in: ["Pending", "Approved"] },
    })
    if (existingRequest) {
      return res.status(400).json({ message: "You already have an active room change request" })
    }

    // Validate requested room exists
    const { requestedRoomId, requestedBedNumber, reason, priorityRequest } = req.body
    const requestedRoom = await Room.findById(requestedRoomId)
    if (!requestedRoom) {
      return res.status(404).json({ message: "Requested room not found" })
    }

    // Check room capacity vs requested bed number
    if (requestedBedNumber > requestedRoom.capacity) {
      return res.status(400).json({ message: "Invalid bed number for requested room" })
    }

    // Create new request
    const newRequest = new RoomChangeRequest({
      studentId: userId,
      studentProfileId: studentProfile._id,
      currentAllocationId: currentAllocation._id,
      requestedRoomId,
      requestedBedNumber,
      reason,
      priorityRequest: priorityRequest || false,
      requiresWardenApproval: requestedRoom.hostelId !== currentAllocation.roomId.hostelId,
    })

    await newRequest.save()
    res.status(201).json(newRequest)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Get room change request status
export const getRoomChangeRequestStatus = async (req, res) => {
  const { userId } = req.params
  try {
    const request = await RoomChangeRequest.findOne({ studentId: userId })
      .populate("studentId", "name email role")
      .populate("studentProfileId", "rollNumber department yearOfStudy")
      .populate({
        path: "currentAllocationId",
        populate: {
          path: "roomId",
          select: "roomNumber unitId hostelId",
        },
      })
      .populate("requestedRoomId", "roomNumber capacity hostelId unitId")
      .populate("reviewedBy", "name role")
      .populate("implementedBy", "name role")
      .populate({
        path: "newAllocationId",
        populate: {
          path: "roomId",
          select: "roomNumber unitId hostelId",
        },
      })
      .exec()

    if (!request) {
      return res.status(404).json({ message: "Room change request not found" })
    }

    res.status(200).json(request)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Update room change request
export const updateRoomChangeRequest = async (req, res) => {
  const { userId } = req.params
  try {
    // Find the existing pending request
    const existingRequest = await RoomChangeRequest.findOne({
      studentId: userId,
      status: "Pending", // Only pending requests can be updated
    })

    if (!existingRequest) {
      return res.status(404).json({ message: "No pending room change request found" })
    }

    const { requestedRoomId, requestedBedNumber, reason, priorityRequest } = req.body
    const updateData = {}

    // Only process fields that are provided in the request body
    if (requestedRoomId) {
      // Validate the requested room exists
      const requestedRoom = await Room.findById(requestedRoomId)
      if (!requestedRoom) {
        return res.status(404).json({ message: "Requested room not found" })
      }

      // If bed number is also being updated, validate against the new room
      if (requestedBedNumber && requestedBedNumber > requestedRoom.capacity) {
        return res.status(400).json({ message: "Invalid bed number for requested room" })
      }

      updateData.requestedRoomId = requestedRoomId

      // Check if new room requires warden approval (different hostel)
      const currentAllocation = await RoomAllocation.findById(
        existingRequest.currentAllocationId
      ).populate("roomId")

      if (currentAllocation) {
        updateData.requiresWardenApproval =
          requestedRoom.hostelId.toString() !== currentAllocation.roomId.hostelId.toString()
      }
    } else if (requestedBedNumber) {
      // If only bed number is updated, validate against existing room
      const existingRoom = await Room.findById(existingRequest.requestedRoomId)
      if (requestedBedNumber > existingRoom.capacity) {
        return res.status(400).json({ message: "Invalid bed number for requested room" })
      }
    }

    // Update other fields if provided
    if (requestedBedNumber) updateData.requestedBedNumber = requestedBedNumber
    if (reason) updateData.reason = reason
    if (priorityRequest !== undefined) updateData.priorityRequest = priorityRequest

    // Update the request
    const updatedRequest = await RoomChangeRequest.findByIdAndUpdate(
      existingRequest._id,
      { $set: updateData },
      { new: true }
    )

    res.status(200).json(updatedRequest)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Delete room change request
export const deleteRoomChangeRequest = async (req, res) => {
  const { userId } = req.params
  try {
    // Only allow deletion of pending requests
    const request = await RoomChangeRequest.findOne({
      studentId: userId,
      status: "Pending",
    })

    if (!request) {
      return res.status(404).json({
        message: "Room change request not found or cannot be deleted in its current status",
      })
    }

    // Delete the request
    await RoomChangeRequest.findByIdAndDelete(request._id)
    res.status(200).json({ message: "Room change request cancelled successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// get all lost and found items
export const getAllLostAndFoundItems = async (req, res) => {
  try {
    const items = await LostAndFound.find({ status: { $ne: "deleted" } })
      .populate("reportedBy", "name email role")
      .sort({ createdAt: -1 })
      .exec()
    res.status(200).json(items)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// add a lost item
export const addLostItem = async (req, res) => {
  const { userId } = req.params
  try {
    const { itemName, category, description, locationFound, images } = req.body

    const newItem = new LostAndFound({
      itemName,
      category,
      description,
      locationFound,
      dateFound: req.body.dateFound || new Date(),
      images: images || [],
      reportedBy: userId,
      userType: "student", // Since this is in studentController
      status: "active",
    })

    await newItem.save()
    res.status(201).json(newItem)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// mark a lost item as deleted if the user is the owner
export const deleteLostItem = async (req, res) => {
  const { itemId } = req.params
  try {
    const item = await LostAndFound.findOne({
      _id: itemId,
      reportedBy: req.user._id,
    })

    if (!item) {
      return res.status(404).json({ message: "Item not found or you are not the reporter" })
    }

    // Instead of deleting, mark as deleted
    item.status = "deleted"
    item.updatedAt = new Date()
    await item.save()

    res.status(200).json({ message: "Item marked as deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// claim a lost item
export const claimLostItem = async (req, res) => {
  const { itemId } = req.params
  const { userId, claimDescription } = req.body

  try {
    const item = await LostAndFound.findById(itemId)

    if (!item) {
      return res.status(404).json({ message: "Item not found" })
    }

    if (item.status !== "active") {
      return res.status(400).json({ message: "This item is no longer available for claiming" })
    }

    // Update the claim information
    item.claim = {
      claimantId: userId,
      claimDescription,
      claimDate: new Date(),
      claimStatus: "pending",
    }

    // If user provides their name
    if (req.body.claimantName) {
      item.claim.claimantName = req.body.claimantName
    }

    // Update status
    item.status = "claimed"
    item.updatedAt = new Date()

    await item.save()
    res.status(200).json(item)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// get all lost items reported by a user
export const getUserLostItems = async (req, res) => {
  const { userId } = req.params
  try {
    const items = await LostAndFound.find({
      reportedBy: userId,
      status: { $ne: "deleted" },
    })
      .sort({ createdAt: -1 })
      .exec()

    res.status(200).json(items)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// update a lost item
export const updateLostItem = async (req, res) => {
  const { itemId } = req.params

  try {
    const item = await LostAndFound.findOne({
      _id: itemId,
      reportedBy: req.user._id,
    })

    if (!item) {
      return res.status(404).json({ message: "Item not found or you are not the reporter" })
    }

    const allowedUpdates = ["itemName", "category", "description", "locationFound", "images"]

    // Only update allowed fields
    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        item[field] = req.body[field]
      }
    }

    item.updatedAt = new Date()
    await item.save()

    res.status(200).json(item)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// file a complaint
export const fileComplaint = async (req, res) => {
  const { userId } = req.params
  try {
    const {
      title,
      description,
      complaintType,
      priority,
      attachments,
      location,
      hostel,
      roomNumber,
    } = req.body

    const newComplaint = new Complaint({
      userId,
      title,
      description,
      complaintType,
      priority,
      attachments,
      location,
      hostel,
      roomNumber,
    })
    await newComplaint.save()

    res.status(201).json(newComplaint)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// get all complaints created by user
export const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ userId: req.params.userId })
      .populate("userId", "name email role")
      .exec()
    res.status(200).json(complaints)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// update complaint
export const updateComplaint = async (req, res) => {
  const { complaintId } = req.params
  try {
    const updatedComplaint = await Complaint.findOneAndUpdate(
      { _id: complaintId },
      { $set: { ...req.body } },
      { new: true } // return the updated complaint
    ) // findOneAndUpdate returns the original document by default
    if (!updatedComplaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    res.status(200).json({ message: "Complaint deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// delete complaint
export const deleteComplaint = async (req, res) => {
  const { complaintId } = req.params
  try {
    const deletedComplaint = await Complaint.findOneAndDelete({ _id: complaintId })
    if (!deletedComplaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    res.status(200).json({ message: "Complaint deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// get all active polls
export const getAllActivePolls = async (req, res) => {
  try {
    const polls = await Poll.find({ isActive: true })
      .populate("createdBy", "name email role")
      .exec()
    res.status(200).json(polls)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// react to a poll
export const reactToPoll = async (req, res) => {
  const { pollId } = req.params
  const { userId, optionId } = req.body
  try {
    const poll = await Poll.findById(pollId)
    if (!poll) {
      return res.status(404).json({ message: "Poll not found" })
    }
    const option = poll.options.id(optionId)
    if (!option) {
      return res.status(404).json({ message: "Option not found" })
    }
    option.votes.push(userId)
    option.voteCount += 1
    await poll.save()
    res.status(200).json(poll)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// remove reaction from a poll
export const removeReactionFromPoll = async (req, res) => {
  const { pollId } = req.params
  const { userId, optionId } = req.body
  try {
    const poll = await Poll.findById(pollId)
    if (!poll) {
      return res.status(404).json({ message: "Poll not found" })
    }
    const option = poll.options.id(optionId)
    if (!option) {
      return res.status(404).json({ message: "Option not found" })
    }
    option.votes.pull(userId)
    option.voteCount -= 1
    await poll.save()
    res.status(200).json(poll)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}
