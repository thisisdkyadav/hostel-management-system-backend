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
  const { hostelId } = req.params
  try {
    const feedbacks = await Feedback.find({ hostelId }).populate("userId", "name email")
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
    const feedback = await Feedback.findByIdAndUpdate(feedbackId, { status }, { new: true })
    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found", success: false })
    }
    res.status(200).json({ message: "Feedback status updated successfully", feedback, success: true })
  } catch (error) {
    res.status(500).json({ message: "Error updating feedback status", error: error.message })
  }
}
