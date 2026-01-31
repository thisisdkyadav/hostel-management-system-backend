/**
 * Task Service
 * Contains all business logic for task operations.
 * 
 * @module services/task
 */

import { Task } from '../../../models/index.js';
import { User } from '../../../models/index.js';
import { BaseService, success, notFound, badRequest, forbidden, PRESETS } from '../../../services/base/index.js';

class TaskService extends BaseService {
  constructor() {
    super(Task, 'Task');
  }

  /**
   * Create a new task
   * @param {Object} taskData - Task data
   * @param {string} userId - Creator user ID
   */
  async createTask(taskData, userId) {
    const { title, description, priority, dueDate, category, assignedUsers } = taskData;

    if (!title || !description || !dueDate) {
      return badRequest('Title, description, and due date are required');
    }

    if (assignedUsers && assignedUsers.length > 0) {
      const userCount = await User.countDocuments({ _id: { $in: assignedUsers } });
      if (userCount !== assignedUsers.length) {
        return badRequest('One or more assigned users do not exist');
      }
    }

    const result = await this.create({
      title,
      description,
      priority: priority || 'Medium',
      dueDate,
      category: category || 'Other',
      assignedUsers: assignedUsers || [],
      createdBy: userId
    });

    if (result.success) {
      return success({ success: true, message: 'Task created successfully', task: result.data }, 201);
    }
    return result;
  }

  /**
   * Get all tasks with pagination
   * @param {Object} options - Filter options
   */
  async getAllTasks({ status, category, priority, page = 1, limit = 12 }) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return badRequest('Invalid pagination parameters');
    }

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    const result = await this.findPaginated(filter, {
      page: pageNum,
      limit: limitNum,
      sort: { createdAt: -1 },
      populate: [
        { path: 'assignedUsers', select: 'name email role' },
        { path: 'createdBy', select: 'name email' }
      ]
    });

    if (result.success) {
      const { items, pagination } = result.data;
      return success({
        tasks: items,
        pagination: {
          total: pagination.total,
          totalPages: pagination.totalPages,
          currentPage: pagination.page,
          perPage: pagination.limit,
          hasNextPage: pagination.page < pagination.totalPages,
          hasPrevPage: pagination.page > 1
        }
      });
    }
    return result;
  }

  /**
   * Get tasks assigned to a specific user
   * @param {string} userId - User ID
   * @param {Object} options - Filter options
   */
  async getUserTasks(userId, { status, category, priority, page = 1, limit = 12 }) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return badRequest('Invalid pagination parameters');
    }

    const filter = { assignedUsers: userId };
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    const result = await this.findPaginated(filter, {
      page: pageNum,
      limit: limitNum,
      sort: { dueDate: 1 },
      populate: [
        { path: 'assignedUsers', select: 'name email role' },
        { path: 'createdBy', select: 'name email' }
      ]
    });

    if (result.success) {
      const { items, pagination } = result.data;
      return success({
        tasks: items,
        pagination: {
          total: pagination.total,
          totalPages: pagination.totalPages,
          currentPage: pagination.page,
          perPage: pagination.limit,
          hasNextPage: pagination.page < pagination.totalPages,
          hasPrevPage: pagination.page > 1
        }
      });
    }
    return result;
  }

  /**
   * Update task status
   * @param {string} taskId - Task ID
   * @param {string} status - New status
   * @param {Object} user - Current user
   */
  async updateTaskStatus(taskId, status, user) {
    const validStatuses = ['Created', 'Assigned', 'In Progress', 'Completed'];
    if (!validStatuses.includes(status)) {
      return badRequest('Invalid status value');
    }

    const task = await this.model.findById(taskId);
    if (!task) {
      return notFound(this.entityName);
    }

    const isAdmin = user.role === 'Admin' || user.role === 'Super Admin';
    const isAssigned = task.assignedUsers.some((u) => u.toString() === user._id.toString());

    if (!isAdmin && !isAssigned) {
      return forbidden('Not authorized to update this task');
    }

    if (!isAdmin && isAssigned) {
      if (status === 'Created' || status === 'Assigned') {
        return forbidden('Assigned users can only update status to In Progress or Completed');
      }
    }

    task.status = status;
    task.updatedAt = Date.now();
    await task.save();

    return success({ message: 'Task status updated successfully', task });
  }

  /**
   * Update task details
   * @param {string} taskId - Task ID
   * @param {Object} taskData - Update data
   */
  async updateTask(taskId, taskData) {
    const { title, description, priority, dueDate, category, assignedUsers } = taskData;

    const task = await this.model.findById(taskId);
    if (!task) {
      return notFound(this.entityName);
    }

    if (assignedUsers) {
      const userCount = await User.countDocuments({ _id: { $in: assignedUsers } });
      if (userCount !== assignedUsers.length) {
        return badRequest('One or more assigned users do not exist');
      }
    }

    if (title) task.title = title;
    if (description) task.description = description;
    if (priority) task.priority = priority;
    if (dueDate) task.dueDate = dueDate;
    if (category) task.category = category;
    if (assignedUsers) task.assignedUsers = assignedUsers;

    task.updatedAt = Date.now();

    if (task.status === 'Created' && task.assignedUsers.length > 0) {
      task.status = 'Assigned';
    }

    const updatedTask = await task.save();
    return success({ message: 'Task updated successfully', task: updatedTask });
  }

  /**
   * Delete task
   * @param {string} taskId - Task ID
   */
  async deleteTask(taskId) {
    const result = await this.deleteById(taskId);
    if (result.success) {
      return { success: true, statusCode: 200, message: 'Task deleted successfully' };
    }
    return result;
  }
}

export const taskService = new TaskService();
export default taskService;
