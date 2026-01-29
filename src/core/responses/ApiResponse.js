/**
 * Standardized API Response Handler
 * Provides consistent response format across all endpoints
 */
export class ApiResponse {
  /**
   * Success response
   * @param {Response} res - Express response object
   * @param {any} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  static success(res, data = null, message = "Success", statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Error response
   * @param {Response} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {any} errors - Additional error details
   */
  static error(res, message = "Error", statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString(),
    })
  }

  /**
   * Paginated response
   * @param {Response} res - Express response object
   * @param {any} data - Response data array
   * @param {Object} pagination - Pagination details
   * @param {string} message - Success message
   */
  static paginated(res, data, pagination, message = "Success") {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrev: pagination.page > 1,
      },
      timestamp: new Date().toISOString(),
    })
  }

  // ========================================
  // LEGACY SUPPORT METHODS
  // These maintain backward compatibility
  // with existing frontend expectations
  // ========================================

  /**
   * Legacy: Return only { message } format
   * DEPRECATED: Use success() instead
   */
  static legacyMessage(res, message, statusCode = 200) {
    return res.status(statusCode).json({ message })
  }

  /**
   * Legacy: Return { success, message } format
   * DEPRECATED: Use success() instead
   */
  static legacySuccess(res, message, statusCode = 200) {
    return res.status(statusCode).json({ success: true, message })
  }

  /**
   * Legacy: Return { success: false, message } format
   * DEPRECATED: Use error() instead
   */
  static legacyError(res, message, statusCode = 500) {
    return res.status(statusCode).json({ success: false, message })
  }
}

export default ApiResponse
