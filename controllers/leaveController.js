import Leave from "../models/Leave.js"

/**
 * Create a new leave
 * @param {Object} req - Request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.reason - Reason for leave
 * @param {string} req.body.startDate - Start date
 * @param {string} req.body.endDate - End date
 */
export const createLeave = async (req, res) => {
  const { reason, startDate, endDate } = req.body
  const user = req.user
  const userId = user._id
  try {
    const leave = new Leave({ userId, reason, startDate, endDate })
    await leave.save()
    res.status(201).json({ message: "Leave created successfully", leave })
  } catch (error) {
    console.error("Error creating leave:", error)
    res.status(500).json({ message: "Error creating leave", error: error.message })
  }
}

/**
 * Get all leaves for a specific user
 * @param {Object} req - Request object
 * @param {Object} req.user - User object
 * @param {string} req.user.id - User ID
 * @param {Object} res - Response object
 */
export const getMyLeaves = async (req, res) => {
  const user = req.user
  const userId = user._id
  try {
    const leaves = await Leave.find({ userId })
    res.status(200).json({ leaves })
  } catch (error) {
    console.error("Error getting leaves:", error)
    res.status(500).json({ message: "Error getting leaves", error: error.message })
  }
}

/**
 * Get all leaves with pagination and filters query
 * @param {Object} req - Request object
 * @param {Object} req.query - Query parameters
 * @param {string} req.query.userId - User ID
 * @param {string} req.query.status - Status
 * @param {string} req.query.startDate - Start date
 * @param {string} req.query.endDate - End date
 * @param {number} req.query.page - Page number
 * @param {number} req.query.limit - Limit
 * @param {Object} res - Response object
 */
export const getLeaves = async (req, res) => {
  const { userId, status, startDate, endDate, page = 1, limit = 10 } = req.query
  try {
    const query = {}
    if (userId) {
      query.userId = userId
    }
    if (status) {
      query.status = status
    }
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) {
        query.createdAt.$gte = new Date(startDate)
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate)
      }
    }
    const leaves = await Leave.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
    const totalCount = await Leave.countDocuments(query)
    const totalPages = Math.ceil(totalCount / parseInt(limit))
    res.status(200).json({ leaves, totalCount, totalPages, currentPage: parseInt(page), limit: parseInt(limit) })
  } catch (error) {
    console.error("Error getting leaves:", error)
    res.status(500).json({ message: "Error getting leaves", error: error.message })
  }
}

/**
 * Approve a leave
 * @param {Object} req - Request object
 * @param {Object} req.params - Params object
 * @param {string} req.params.id - Leave ID
 * @param {Object} req.body - Request body
 * @param {string} req.body.approvalInfo - Approval info
 */
export const approveLeave = async (req, res) => {
  const { id } = req.params
  const { approvalInfo } = req.body
  try {
    const leave = await Leave.findByIdAndUpdate(id, { status: "Approved", approvalInfo, approvalDate: new Date(), approvalBy: req.user._id }, { new: true })
    if (!leave) {
      return res.status(404).json({ message: "Leave not found", success: false })
    }
    res.status(200).json({ message: "Leave approved successfully", leave, success: true })
  } catch (error) {
    console.error("Error approving leave:", error)
    res.status(500).json({ message: "Error approving leave", error: error.message, success: false })
  }
}

/**
 * Reject a leave
 * @param {Object} req - Request object
 * @param {Object} req.params - Params object
 * @param {string} req.params.id - Leave ID
 * @param {Object} req.body - Request body
 * @param {string} req.body.status - Status
 * @param {string} req.body.reasonForRejection - Reason for rejection
 */
export const rejectLeave = async (req, res) => {
  const { id } = req.params
  const { reasonForRejection } = req.body
  try {
    const leave = await Leave.findByIdAndUpdate(id, { status: "Rejected", reasonForRejection, approvalDate: new Date(), approvalBy: req.user._id }, { new: true })
    if (!leave) {
      return res.status(404).json({ message: "Leave not found", success: false })
    }
    res.status(200).json({ message: "Leave rejected successfully", leave, success: true })
  } catch (error) {
    console.error("Error rejecting leave:", error)
    res.status(500).json({ message: "Error rejecting leave", error: error.message, success: false })
  }
}

/**
 * Join a leave
 * @param {Object} req - Request object
 * @param {Object} req.params - Params object
 * @param {string} req.params.id - Leave ID
 * @param {Object} req.body - Request body
 * @param {string} req.body.joinInfo - Join info
 */
export const joinLeave = async (req, res) => {
  const { id } = req.params
  const { joinInfo } = req.body
  try {
    const leave = await Leave.findByIdAndUpdate(id, { joinInfo, joinDate: new Date(), joinStatus: "Joined" }, { new: true })
    if (!leave) {
      return res.status(404).json({ message: "Leave not found", success: false })
    }
    res.status(200).json({ message: "Leave joined successfully", leave, success: true })
  } catch (error) {
    console.error("Error joining leave:", error)
    res.status(500).json({ message: "Error joining leave", error: error.message, success: false })
  }
}
