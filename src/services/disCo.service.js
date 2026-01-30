import DisCoAction from "../../models/DisCoAction.js"
import StudentProfile from "../../models/StudentProfile.js"

class DisCoService {
  async addDisCoAction(data) {
    const { studentId, reason, actionTaken, date, remarks } = data
    try {
      console.log(studentId)

      const studentProfile = await StudentProfile.findOne({ userId: studentId })

      if (!studentProfile) {
        return { success: false, statusCode: 404, message: "Student profile not found" }
      }
      console.log(studentProfile)

      const newDisCo = new DisCoAction({
        userId: studentId,
        reason,
        actionTaken,
        date,
        remarks,
      })

      await newDisCo.save()

      return { success: true, statusCode: 201, data: { message: "DisCo action added successfully" } }
    } catch (error) {
      console.error("Error adding DisCo action:", error)
      return { success: false, statusCode: 500, message: "Error adding DisCo action", error: error.message }
    }
  }

  async getDisCoActionsByStudent(studentId) {
    try {
      const actions = await DisCoAction.find({ userId: studentId }).populate("userId", "name email")

      return {
        success: true,
        statusCode: 200,
        data: {
          success: true,
          message: "Disciplinary actions fetched successfully",
          actions,
        },
      }
    } catch (error) {
      console.error("Error fetching disciplinary actions:", error)
      return {
        success: false,
        statusCode: 500,
        message: "Error fetching disciplinary actions",
        error: error.message,
      }
    }
  }

  async updateDisCoAction(disCoId, data) {
    const { reason, actionTaken, date, remarks } = data

    try {
      const updated = await DisCoAction.findByIdAndUpdate(disCoId, { reason, actionTaken, date, remarks }, { new: true })

      if (!updated) {
        return { success: false, statusCode: 404, message: "DisCo action not found" }
      }

      return { success: true, statusCode: 200, data: { message: "DisCo action updated successfully", action: updated } }
    } catch (error) {
      console.error("Error updating DisCo action:", error)
      return { success: false, statusCode: 500, message: "Error updating DisCo action", error: error.message }
    }
  }

  async deleteDisCoAction(disCoId) {
    try {
      const deleted = await DisCoAction.findByIdAndDelete(disCoId)

      if (!deleted) {
        return { success: false, statusCode: 404, message: "DisCo action not found" }
      }

      return { success: true, statusCode: 200, data: { message: "DisCo action deleted successfully" } }
    } catch (error) {
      console.error("Error deleting DisCo action:", error)
      return { success: false, statusCode: 500, message: "Error deleting DisCo action", error: error.message }
    }
  }
}

export const disCoService = new DisCoService()
