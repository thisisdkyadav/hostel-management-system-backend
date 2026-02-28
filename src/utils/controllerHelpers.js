/**
 * Minimal controller helpers
 * Keep only helpers that are actively used in runtime code.
 */

export { asyncHandler } from "./asyncHandler.js"

/**
 * Send service output directly as HTTP response.
 * Expected result shape: { success, statusCode, data, message?, error? }
 */
export const sendRawResponse = (res, result) => {
  if (!result?.success) {
    return res.status(result?.statusCode || 400).json({
      message: result?.message,
      error: result?.error,
    })
  }

  return res.status(result?.statusCode || 200).json(result?.data)
}

export default {
  sendRawResponse,
}
