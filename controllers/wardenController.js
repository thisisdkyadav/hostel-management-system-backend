import Complaint from "../models/Complaint.js"
import Warden from "../models/Warden.js"
import Poll from "../models/Poll.js"

export const createWardenProfile = async (req, res) => {
  const { userId } = req.params
  try {
    const existingProfile = await Warden.findOne({ userId })

    if (existingProfile) {
      return res.status(400).json({ message: "Warden profile already exists" })
    }

    const newProfile = new Warden({ userId, ...req.body })
    await newProfile.save()
    res.status(201).json(newProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const getWardenProfile = async (req, res) => {
  const user = req.user
  const userId = user._id
  try {
    const wardenProfile = await Warden.findOne({ userId }).populate("userId", "name email role").populate("hostelId", "name type").exec()

    if (!wardenProfile) {
      return res.status(404).json({ message: "Warden profile not found" })
    }

    res.status(200).json(wardenProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const updateWardenProfile = async (req, res) => {
  const { userId } = req.params
  try {
    const updatedProfile = await Warden.findOneAndUpdate({ userId }, { $set: req.body }, { new: true })

    if (!updatedProfile) {
      return res.status(404).json({ message: "Warden profile update failed" })
    }

    res.status(200).json(updatedProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// 1. Get the count of resolved and pending complaints
export const getComplaintStats = async (req, res) => {
  const { userId } = req.params
  try {
    const warden = await Warden.findOne({ userId })
    if (!warden) return res.status(404).json({ message: "Warden not found" })

    const hostel = warden.hostel

    const pendingCount = await Complaint.countDocuments({ hostel, status: "pending" })
    const resolvedCount = await Complaint.countDocuments({ hostel, status: "resolved" })

    res.status(200).json({ pendingCount, resolvedCount })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// 2. Get the complete details of all complaints for warden's hostel
export const getAllComplaints = async (req, res) => {
  const { userId } = req.params
  try {
    const warden = await Warden.findOne({ userId })
    if (!warden) return res.status(404).json({ message: "Warden not found" })

    const complaints = await Complaint.find({ hostel: warden.hostel })
    res.status(200).json(complaints)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// 3. Assign complaint to staff
export const assignComplaint = async (req, res) => {
  const { complaintId } = req.params
  const { staffType } = req.body
  try {
    const complaint = await Complaint.findById(complaintId)
    if (!complaint) return res.status(404).json({ message: "Complaint not found" })

    complaint.assignedTo = staffType
    complaint.status = "In Progress"
    await complaint.save()

    res.status(200).json({ message: "Complaint assigned successfully", complaint })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// 4. Get complaint status
export const getComplaintStatus = async (req, res) => {
  const { userId } = req.params
  try {
    const warden = await Warden.findOne({ userId })
    if (!warden) return res.status(404).json({ message: "Warden not found" })

    const complaints = await Complaint.find({ hostel: warden.hostel }).select("title issuedDate resolvedDate status")

    const formattedComplaints = complaints.map((complaint) => ({
      title: complaint.title,
      issuedDate: complaint.issuedDate,
      resolvedDate: complaint.resolvedDate || "TBD",
      status: complaint.status,
    }))

    res.status(200).json(formattedComplaints)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Create a poll
export const createPoll = async (req, res) => {
  const { wardenId } = req.params
  const { question, options } = req.body

  if (!question || !options || options.length < 2) {
    return res.status(400).json({ message: "Invalid poll data" })
  }

  try {
    const newPoll = new Poll({
      question,
      options: options.map((option) => ({
        option,
        votes: [],
        voteCount: 0,
      })),
      createdBy: wardenId,
    })

    await newPoll.save()
    res.status(201).json(newPoll)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Fetch poll results (basic structure)
export const getPollResults = async (req, res) => {
  const { pollId } = req.params

  try {
    const poll = await Poll.findById(pollId)
    if (!poll) {
      return res.status(404).json({ message: "Poll not found" })
    }

    // Placeholder for actual results
    res.status(200).json({ poll, results: "Results not structured yet" })
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Get recent polls
export const getRecentPolls = async (req, res) => {
  try {
    const recentPolls = await Poll.find().sort({ createdAt: -1 }).limit(5) // Fetch last 5 polls
    res.status(200).json(recentPolls)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

// Function to create student record
export const createStudent = async (req, res) => {
  try {
    const { name, details } = req.body

    // Validation
    if (!name || !details) {
      return res.status(400).json({ message: "All fields are required" })
    }

    // Create new student record
    const newStudent = new Student({ name, details })
    await newStudent.save()

    res.status(201).json({ message: "Student data saved successfully", student: newStudent })
  } catch (error) {
    console.error("Error saving student data:", error)
    res.status(500).json({ message: "Server error" })
  }
}
