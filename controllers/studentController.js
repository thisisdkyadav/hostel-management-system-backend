import StudentProfile from "../models/StudentProfile"

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

// function to handle room change request
export const requestRoomChange = async (req, res) => {
  const { userId } = req.params
  try {
    // check if room change request already exists
    const existingRequest = await RoomChangeRequest.findOne({
      userId,
    })
    if (existingRequest) {
      return res.status(400).json({ message: "Room change request already exists" })
    }
    const newRequest = new RoomChangeRequest({
      userId,
      ...req.body,
    })
    await newRequest.save()
    res.status(201).json(newRequest)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// get room change request status
export const getRoomChangeRequestStatus = async (req, res) => {
  const { userId } = req.params
  try {
    const request = await RoomChangeRequest.findOne({ userId })
      .populate("userId", "name email role")
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

// delete room change request
export const deleteRoomChangeRequest = async (req, res) => {
  const { userId } = req.params
  try {
    const deletedRequest = await RoomChangeRequest.findOneAnd
    Delete({ userId })
    if (!deletedRequest) {
      return res.status(404).json({ message: "Room change request not found" })
    }
    res.status(200).json({ message: "Room change request deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// get all lost and found items
export const getAllLostAndFoundItems = async (req, res) => {
  try {
    const items = await LostAndFoundItem.find().populate("userId", "name email role").exec()
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
    const newItem = new LostAndFoundItem({
      userId,
      ...req.body,
    })
    await newItem.save()
    res.status(201).json(newItem)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// delete a lost item if the user is the owner
export const deleteLostItem = async (req, res) => {
  const { itemId } = req.params
  try {
    const deletedItem = await LostAndFoundItem.findOneAndDelete({
      _id: itemId,
      userId: req.user._id,
    })
    if (!deletedItem) {
      return res.status(404).json({ message: "Item not found or you are not the owner" })
    }
    res.status(200).json({ message: "Item deleted successfully" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// react to a lost item
export const reactToLostItem = async (req, res) => {
  const { itemId } = req.params
  const { userId, reaction } = req.body
  try {
    const item = await LostAndFoundItem.findById(itemId)
    if (!item) {
      return res.status(404).json({ message: "Item not found" })
    }
    item.reactions.push({ userId, reaction })
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
    const newComplaint = new Complaint({
      userId,
      ...req.body,
    })
    await newComplaint.save()
    res.status(201).json(newComplaint)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// get all complaints
export const getAllComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find().populate("userId", "name email role").exec()
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
      { $set: req.body },
      { new: true } // return the updated complaint
    ) // findOneAndUpdate returns the original document by default
    if (!updatedComplaint) {
      return res.status(404).json({ message: "Complaint not found" })
    }
    res.status(200).json(updatedComplaint)
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
