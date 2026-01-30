import { leaveService } from "../services/leave.service.js"

/**
 * Create a new leave
 * @param {Object} req - Request object
 * @param {Object} req.body - Request body
 * @param {string} req.body.reason - Reason for leave
 * @param {string} req.body.startDate - Start date
 * @param {string} req.body.endDate - End date
 */
export const createLeave = async (req, res) => {
  const result = await leaveService.createLeave(req.body, req.user._id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

/**
 * Get all leaves for a specific user
 * @param {Object} req - Request object
 * @param {Object} req.user - User object
 * @param {string} req.user.id - User ID
 * @param {Object} res - Response object
 */
export const getMyLeaves = async (req, res) => {
  const result = await leaveService.getMyLeaves(req.user._id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
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
  const result = await leaveService.getLeaves(req.query)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
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
  const result = await leaveService.approveLeave(req.params.id, req.body, req.user._id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json({ ...result.data, success: true })
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
  const result = await leaveService.rejectLeave(req.params.id, req.body, req.user._id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json({ ...result.data, success: true })
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
  const result = await leaveService.joinLeave(req.params.id, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, success: false })
  }
  res.status(result.statusCode).json({ ...result.data, success: true })
}
