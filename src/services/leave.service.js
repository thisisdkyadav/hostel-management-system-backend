import Leave from "../../models/Leave.js"

class LeaveService {
  async createLeave(data, userId) {
    const { reason, startDate, endDate } = data
    try {
      const leave = new Leave({ userId, reason, startDate, endDate })
      await leave.save()
      return { success: true, statusCode: 201, data: { message: "Leave created successfully", leave } }
    } catch (error) {
      console.error("Error creating leave:", error)
      return { success: false, statusCode: 500, message: "Error creating leave", error: error.message }
    }
  }

  async getMyLeaves(userId) {
    try {
      const leaves = await Leave.find({ userId })
      return { success: true, statusCode: 200, data: { leaves } }
    } catch (error) {
      console.error("Error getting leaves:", error)
      return { success: false, statusCode: 500, message: "Error getting leaves", error: error.message }
    }
  }

  async getLeaves(query) {
    const { userId, status, startDate, endDate, page = 1, limit = 10 } = query
    try {
      const queryObj = {}
      if (userId) {
        queryObj.userId = userId
      }
      if (status) {
        queryObj.status = status
      }
      if (startDate || endDate) {
        queryObj.createdAt = {}
        if (startDate) {
          queryObj.createdAt.$gte = new Date(startDate)
        }
        if (endDate) {
          queryObj.createdAt.$lte = new Date(endDate)
        }
      }
      const leaves = await Leave.find(queryObj)
        .populate("userId", "name email")
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
      const totalCount = await Leave.countDocuments(queryObj)
      const totalPages = Math.ceil(totalCount / parseInt(limit))
      return { success: true, statusCode: 200, data: { leaves, totalCount, totalPages, currentPage: parseInt(page), limit: parseInt(limit) } }
    } catch (error) {
      console.error("Error getting leaves:", error)
      return { success: false, statusCode: 500, message: "Error getting leaves", error: error.message }
    }
  }

  async approveLeave(id, data, approvalBy) {
    const { approvalInfo } = data
    try {
      const leave = await Leave.findByIdAndUpdate(id, { status: "Approved", approvalInfo, approvalDate: new Date(), approvalBy }, { new: true })
      if (!leave) {
        return { success: false, statusCode: 404, message: "Leave not found" }
      }
      return { success: true, statusCode: 200, data: { message: "Leave approved successfully", leave } }
    } catch (error) {
      console.error("Error approving leave:", error)
      return { success: false, statusCode: 500, message: "Error approving leave", error: error.message }
    }
  }

  async rejectLeave(id, data, approvalBy) {
    const { reasonForRejection } = data
    try {
      const leave = await Leave.findByIdAndUpdate(id, { status: "Rejected", reasonForRejection, approvalDate: new Date(), approvalBy }, { new: true })
      if (!leave) {
        return { success: false, statusCode: 404, message: "Leave not found" }
      }
      return { success: true, statusCode: 200, data: { message: "Leave rejected successfully", leave } }
    } catch (error) {
      console.error("Error rejecting leave:", error)
      return { success: false, statusCode: 500, message: "Error rejecting leave", error: error.message }
    }
  }

  async joinLeave(id, data) {
    const { joinInfo } = data
    try {
      const leave = await Leave.findByIdAndUpdate(id, { joinInfo, joinDate: new Date(), joinStatus: "Joined" }, { new: true })
      if (!leave) {
        return { success: false, statusCode: 404, message: "Leave not found" }
      }
      return { success: true, statusCode: 200, data: { message: "Leave joined successfully", leave } }
    } catch (error) {
      console.error("Error joining leave:", error)
      return { success: false, statusCode: 500, message: "Error joining leave", error: error.message }
    }
  }
}

export const leaveService = new LeaveService()
