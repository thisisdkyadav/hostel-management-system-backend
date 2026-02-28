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

/**
 * Strict standard response envelope.
 * Shape:
 * { success: boolean, message: string | null, data: any, errors: any[] | null }
 */
export const sendStandardResponse = (res, result) => {
  const statusCode = result?.statusCode || (result?.success ? 200 : 400)

  if (result?.success) {
    return res.status(statusCode).json({
      success: true,
      message: result?.message || null,
      data: result?.data ?? null,
      errors: null,
    })
  }

  const errors = Array.isArray(result?.errors)
    ? result.errors
    : result?.error
      ? [result.error]
      : null

  return res.status(statusCode).json({
    success: false,
    message: result?.message || "Request failed",
    data: null,
    errors,
  })
}

export default {
  sendRawResponse,
  sendStandardResponse,
}
