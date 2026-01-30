/**
 * Task Controller
 * Handles HTTP requests for task operations.
 * Business logic delegated to TaskService.
 * 
 * @module controllers/task
 */

import { taskService } from '../services/task.service.js';

/**
 * Create a new task (admin only)
 * @route POST /api/tasks
 */
export const createTask = async (req, res) => {
  try {
    const result = await taskService.createTask(req.body, req.user._id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all tasks with pagination (admin only)
 * @route GET /api/tasks
 */
export const getAllTasks = async (req, res) => {
  try {
    const result = await taskService.getAllTasks(req.query);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get tasks assigned to the logged-in user with pagination
 * @route GET /api/tasks/user
 */
export const getUserTasks = async (req, res) => {
  try {
    const result = await taskService.getUserTasks(req.user._id, req.query);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching user tasks:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update task status (admin or assigned user)
 * @route PATCH /api/tasks/:id/status
 */
export const updateTaskStatus = async (req, res) => {
  try {
    const result = await taskService.updateTaskStatus(req.params.id, req.body.status, req.user);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error updating task status:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update task details (admin only)
 * @route PUT /api/tasks/:id
 */
export const updateTask = async (req, res) => {
  try {
    const result = await taskService.updateTask(req.params.id, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete task (admin only)
 * @route DELETE /api/tasks/:id
 */
export const deleteTask = async (req, res) => {
  try {
    const result = await taskService.deleteTask(req.params.id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
