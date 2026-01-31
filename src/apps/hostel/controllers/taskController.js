/**
 * Task Controller
 * Handles HTTP requests for task operations.
 * Business logic delegated to TaskService.
 * 
 * @module controllers/task
 */

import { taskService } from '../services/task.service.js';
import { asyncHandler } from '../../../utils/controllerHelpers.js';

/**
 * Helper: Send raw response (preserves existing format)
 * Error: { message }
 * Success: result.data directly
 */
const sendResponse = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  res.status(result.statusCode).json(result.data);
};

/**
 * Create a new task (admin only)
 * @route POST /api/tasks
 */
export const createTask = asyncHandler(async (req, res) => {
  const result = await taskService.createTask(req.body, req.user._id);
  sendResponse(res, result);
});

/**
 * Get all tasks with pagination (admin only)
 * @route GET /api/tasks
 */
export const getAllTasks = asyncHandler(async (req, res) => {
  const result = await taskService.getAllTasks(req.query);
  sendResponse(res, result);
});

/**
 * Get tasks assigned to the logged-in user with pagination
 * @route GET /api/tasks/user
 */
export const getUserTasks = asyncHandler(async (req, res) => {
  const result = await taskService.getUserTasks(req.user._id, req.query);
  sendResponse(res, result);
});

/**
 * Update task status (admin or assigned user)
 * @route PATCH /api/tasks/:id/status
 */
export const updateTaskStatus = asyncHandler(async (req, res) => {
  const result = await taskService.updateTaskStatus(req.params.id, req.body.status, req.user);
  sendResponse(res, result);
});

/**
 * Update task details (admin only)
 * @route PUT /api/tasks/:id
 */
export const updateTask = asyncHandler(async (req, res) => {
  const result = await taskService.updateTask(req.params.id, req.body);
  sendResponse(res, result);
});

/**
 * Delete task (admin only)
 * @route DELETE /api/tasks/:id
 */
export const deleteTask = asyncHandler(async (req, res) => {
  const result = await taskService.deleteTask(req.params.id);
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  // Delete returns message directly, not data
  res.status(result.statusCode).json({ message: result.message });
});
