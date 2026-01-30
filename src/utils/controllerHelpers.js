/**
 * Controller Helper Utilities
 * Reduces boilerplate in controllers while preserving existing response formats
 * 
 * @module utils/controllerHelpers
 * 
 * @example
 * // Option 1: Use asyncHandler to remove try-catch (errors go to global handler)
 * import { asyncHandler } from './asyncHandler.js';
 * 
 * export const getUsers = asyncHandler(async (req, res) => {
 *   const result = await userService.getUsers(req.query);
 *   res.status(result.statusCode).json(result.data);
 * });
 * 
 * @example
 * // Option 2: Use sendServiceResponse for standard service results
 * import { asyncHandler, sendServiceResponse } from './controllerHelpers.js';
 * 
 * export const getUsers = asyncHandler(async (req, res) => {
 *   const result = await userService.getUsers(req.query);
 *   sendServiceResponse(res, result);
 * });
 * 
 * @example
 * // Option 3: Use createServiceHandler for simple pass-through endpoints
 * import { createServiceHandler } from './controllerHelpers.js';
 * 
 * export const getUsers = createServiceHandler(
 *   (req) => userService.getUsers(req.query)
 * );
 */

// Re-export asyncHandler for convenience
export { asyncHandler } from './asyncHandler.js';

/**
 * Send a standardized response from a service result
 * Preserves the service's response structure exactly
 * 
 * Use this when service returns: { success, statusCode, data, message, ... }
 * 
 * @param {Response} res - Express response object
 * @param {Object} result - Service result object
 * @param {Object} options - Optional overrides
 * @param {string} options.successMessage - Override success message
 * @param {string} options.errorMessage - Override error message
 */
export const sendServiceResponse = (res, result, options = {}) => {
  const { successMessage, errorMessage } = options;

  if (!result.success) {
    return res.status(result.statusCode || 400).json({
      success: false,
      message: errorMessage || result.message,
      error: result.error,
      errors: result.errors,
    });
  }

  // If result.data is the full response (has its own structure), send it directly
  // Otherwise wrap it
  const response = result.data !== undefined 
    ? (typeof result.data === 'object' && result.data !== null ? result.data : { data: result.data })
    : {};

  return res.status(result.statusCode || 200).json({
    success: true,
    ...response,
    message: successMessage || result.message,
  });
};

/**
 * Send raw service data (when service returns { success, statusCode, data })
 * Frontend expects: result.data directly
 * 
 * @param {Response} res - Express response object
 * @param {Object} result - Service result object
 */
export const sendRawResponse = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode || 400).json({ 
      message: result.message,
      error: result.error,
    });
  }
  return res.status(result.statusCode || 200).json(result.data);
};

/**
 * Create a simple controller handler that calls a service and sends response
 * Best for simple CRUD endpoints with standard response format
 * 
 * @param {Function} serviceCall - Function that takes (req) and returns service result
 * @param {Object} options - Response options
 * @param {boolean} options.raw - If true, sends result.data directly (default: false)
 * @returns {Function} Express route handler wrapped in asyncHandler
 * 
 * @example
 * // Standard response format
 * export const getLeaves = createServiceHandler(
 *   (req) => leaveService.getMyLeaves(req.user._id)
 * );
 * 
 * @example
 * // Raw data response (result.data sent directly)
 * export const getComplaints = createServiceHandler(
 *   (req) => complaintService.getAll(req.query),
 *   { raw: true }
 * );
 */
export const createServiceHandler = (serviceCall, options = {}) => {
  const { raw = false, successMessage, errorMessage } = options;
  
  return async (req, res, next) => {
    try {
      const result = await serviceCall(req);
      
      if (raw) {
        return sendRawResponse(res, result);
      }
      
      return sendServiceResponse(res, result, { successMessage, errorMessage });
    } catch (error) {
      next(error); // Pass to global error handler
    }
  };
};

/**
 * Create a handler with custom response transformation
 * Use when you need to modify the response structure
 * 
 * @param {Function} serviceCall - Function that takes (req) and returns service result
 * @param {Function} transformer - Function that transforms (result, req) into response object
 * @returns {Function} Express route handler
 * 
 * @example
 * export const getComplaints = createCustomHandler(
 *   (req) => complaintService.getAll(req.query, req.user),
 *   (result) => ({
 *     data: result.data.complaints,
 *     meta: { total: result.data.total, page: result.data.page },
 *     message: 'Complaints fetched',
 *     status: 'success',
 *   })
 * );
 */
export const createCustomHandler = (serviceCall, transformer) => {
  return async (req, res, next) => {
    try {
      const result = await serviceCall(req);
      
      if (!result.success) {
        return res.status(result.statusCode || 400).json({
          message: result.message,
          error: result.error,
          status: 'error',
        });
      }
      
      const response = transformer(result, req);
      return res.status(result.statusCode || 200).json(response);
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Wrap an existing controller function with error handling
 * Use this to add asyncHandler to existing controllers without rewriting
 * 
 * @param {Function} controllerFn - Existing controller function
 * @returns {Function} Wrapped controller with error handling
 * 
 * @example
 * // Existing controller
 * const getUsers = async (req, res) => {
 *   const result = await userService.getUsers();
 *   res.json(result.data);
 * };
 * 
 * // Wrap it
 * export const getUsersWrapped = wrapController(getUsers);
 */
export const wrapController = (controllerFn) => {
  return async (req, res, next) => {
    try {
      await controllerFn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

export default {
  sendServiceResponse,
  sendRawResponse,
  createServiceHandler,
  createCustomHandler,
  wrapController,
};
