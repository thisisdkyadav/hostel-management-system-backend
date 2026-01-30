import Feedback from "../../models/Feedback.js"
import StudentProfile from "../../models/StudentProfile.js"

class FeedbackService {
  async createFeedback(data, user) {
    try {
      console.log("Creating feedback...")

      const userId = user._id

      const studentProfile = await StudentProfile.findOne({ userId }).populate("currentRoomAllocation")
      console.log("Student Profile:", studentProfile)

      if (!studentProfile || !studentProfile.currentRoomAllocation) {
        return {
          success: false,
          statusCode: 400,
          message: "Cannot create feedback. User doesn't have an active hostel allocation.",
        }
      }
      const hostelId = studentProfile.currentRoomAllocation.hostelId

      const feedback = new Feedback({
        userId,
        hostelId,
        title: data.title,
        description: data.description,
      })

      console.log("Feedback Data:", feedback)

      await feedback.save()
      return { success: true, statusCode: 201, data: { message: "Feedback created successfully", feedback, success: true } }
    } catch (error) {
      console.error("Error creating feedback:", error)
      return { success: false, statusCode: 500, message: "Error creating feedback", error: error.message }
    }
  }

  async getFeedbacks(query, user) {
    try {
      const queryObj = query || {}

      if (user.hostel) {
        queryObj.hostelId = user.hostel._id
      } else if (user.role === "Student") {
        queryObj.userId = user._id
      }

      const feedbacks = await Feedback.find(queryObj).populate("userId", "name email profileImage").populate("hostelId", "name")
      return { success: true, statusCode: 200, data: { feedbacks, success: true } }
    } catch (error) {
      console.error("Error fetching feedback:", error)
      return { success: false, statusCode: 500, message: "Error fetching feedback", error: error.message }
    }
  }

  async updateFeedbackStatus(feedbackId, status) {
    try {
      const feedback = await Feedback.findByIdAndUpdate(feedbackId, { status, reply: null }, { new: true })
      if (!feedback) {
        return { success: false, statusCode: 404, message: "Feedback not found" }
      }
      return { success: true, statusCode: 200, data: { message: "Feedback status updated successfully", feedback, success: true } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Error updating feedback status", error: error.message }
    }
  }

  async replyToFeedback(feedbackId, reply) {
    try {
      const feedback = await Feedback.findByIdAndUpdate(feedbackId, { reply, status: "Seen" }, { new: true })
      if (!feedback) {
        return { success: false, statusCode: 404, message: "Feedback not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Reply added successfully", feedback, success: true } }
    } catch (error) {
      console.error("Error replying to feedback:", error)
      return { success: false, statusCode: 500, message: "Error replying to feedback", error: error.message }
    }
  }

  async updateFeedback(feedbackId, data) {
    try {
      const feedback = await Feedback.findByIdAndUpdate(feedbackId, { title: data.title, description: data.description }, { new: true })

      if (!feedback) {
        return { success: false, statusCode: 404, message: "Feedback not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Feedback updated successfully", feedback, success: true } }
    } catch (error) {
      console.error("Error updating feedback:", error)
      return { success: false, statusCode: 500, message: "Error updating feedback", error: error.message }
    }
  }

  async deleteFeedback(feedbackId) {
    try {
      const feedback = await Feedback.findByIdAndDelete(feedbackId)

      if (!feedback) {
        return { success: false, statusCode: 404, message: "Feedback not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Feedback deleted successfully", success: true } }
    } catch (error) {
      console.error("Error deleting feedback:", error)
      return { success: false, statusCode: 500, message: "Error deleting feedback", error: error.message }
    }
  }

  async getStudentFeedbacks(userId) {
    try {
      const feedbacks = await Feedback.find({ userId }).populate("userId", "name email profileImage").populate("hostelId", "name")
      return { success: true, statusCode: 200, data: { feedbacks, success: true } }
    } catch (error) {
      console.error("Error fetching student feedback:", error)
      return { success: false, statusCode: 500, message: "Error fetching student feedback", error: error.message }
    }
  }
}

export const feedbackService = new FeedbackService()
