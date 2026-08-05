/**
 * handler(fn) - controller adapter
 *
 * Wraps a service-style controller function into an Express handler so the
 * per-handler plumbing (unwrap ServiceResponse -> shape response) lives in
 * exactly one place instead of being copy-pasted into every controller.
 *
 * `fn(req, res)` should return a ServiceResponse-shaped object:
 *   { success, statusCode, data, message?, errors? }
 * The result is emitted through the single standard envelope via
 * `sendStandardResponse`.
 *
 * Behaviour:
 * - Thrown errors propagate to the global errorHandler (through asyncHandler).
 * - Escape hatch: if `fn` writes the response itself (stream / redirect /
 *   res.json), `res.headersSent` is true and the adapter does not double-send.
 *
 * @example
 *   export const getComplaintById = handler((req) =>
 *     complaintService.getComplaintById(req.params.id, req.user)
 *   )
 */
import { asyncHandler } from "../../utils/asyncHandler.js"
import { sendStandardResponse } from "../../utils/controllerHelpers.js"

export const handler = (fn) =>
  asyncHandler(async (req, res) => {
    const result = await fn(req, res)
    if (res.headersSent) return
    return sendStandardResponse(res, result)
  })

export default handler
