import Feedback from "../models/Feedback.js"
import User from "../models/User.js"
import StudentProfile from "../models/StudentProfile.js"

export const createFeedback = async (req, res) => {
  const { title, description } = req.body
  const user = req.user

  try {
    console.log("Creating feedback...")

    const userId = user._id

    const studentProfile = await StudentProfile.findOne({ userId }).populate("currentRoomAllocation")
    console.log("Student Profile:", studentProfile)

    if (!studentProfile || !studentProfile.currentRoomAllocation) {
      return res.status(400).json({
        message: "Cannot create feedback. User doesn't have an active hostel allocation.",
        success: false,
      })
    }
    const hostelId = studentProfile.currentRoomAllocation.hostelId

    const feedback = new Feedback({
      userId,
      hostelId,
      title,
      description,
    })

    console.log("Feedback Data:", feedback)

    await feedback.save()
    res.status(201).json({ message: "Feedback created successfully", feedback, success: true })
  } catch (error) {
    console.error("Error creating feedback:", error)
    res.status(500).json({ message: "Error creating feedback", error: error.message })
  }
}

export const getFeedbacks = async (req, res) => {
  const user = req.user
  try {
    const query = req.query || {}

    if (user.hostel) {
      query.hostelId = user.hostel._id
    } else if (user.role === "Student") {
      query.userId = user._id
    }

    const feedbacks = await Feedback.find(query).populate("userId", "name email profileImage").populate("hostelId", "name")
    res.status(200).json({ feedbacks, success: true })
  } catch (error) {
    console.error("Error fetching feedback:", error)
    res.status(500).json({ message: "Error fetching feedback", error: error.message })
  }
}

export const updateFeedbackStatus = async (req, res) => {
  const { feedbackId } = req.params
  const { status } = req.body

  try {
    const feedback = await Feedback.findByIdAndUpdate(feedbackId, { status, reply: null }, { new: true })
    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found", success: false })
    }
    res.status(200).json({ message: "Feedback status updated successfully", feedback, success: true })
  } catch (error) {
    res.status(500).json({ message: "Error updating feedback status", error: error.message })
  }
}

export const replyToFeedback = async (req, res) => {
  const { feedbackId } = req.params
  const { reply } = req.body

  try {
    const feedback = await Feedback.findByIdAndUpdate(feedbackId, { reply, status: "Seen" }, { new: true })
    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found", success: false })
    }

    res.status(200).json({ message: "Reply added successfully", feedback, success: true })
  } catch (error) {
    console.error("Error replying to feedback:", error)
    res.status(500).json({ message: "Error replying to feedback", error: error.message })
  }
}

export const updateFeedback = async (req, res) => {
  const { feedbackId } = req.params
  const { title, description } = req.body

  try {
    const feedback = await Feedback.findByIdAndUpdate(feedbackId, { title, description }, { new: true })

    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found", success: false })
    }

    res.status(200).json({ message: "Feedback updated successfully", feedback, success: true })
  } catch (error) {
    console.error("Error updating feedback:", error)
    res.status(500).json({ message: "Error updating feedback", error: error.message })
  }
}

export const deleteFeedback = async (req, res) => {
  const { feedbackId } = req.params

  try {
    const feedback = await Feedback.findByIdAndDelete(feedbackId)

    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found", success: false })
    }

    res.status(200).json({ message: "Feedback deleted successfully", success: true })
  } catch (error) {
    console.error("Error deleting feedback:", error)
    res.status(500).json({ message: "Error deleting feedback", error: error.message })
  }
}
