/**
 * Tasks Service
 * Contains all business logic for task operations.
 * 
 * @module apps/operations/modules/tasks/service
 */

import { userQueries } from '../../../../services/user/userQueries.service.js';
import {
  success,
  notFound,
  badRequest,
  forbidden,
  error,
  conflict,
} from '../../../../services/base/index.js';
import { taskOwner } from '../../../../services/task/taskOwner.service.js';
import { taskQueries } from '../../../../services/task/taskQueries.service.js';

const ENTITY = 'Task';

class TasksService {
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
      const userCount = await userQueries.countUsers({ _id: { $in: assignedUsers } });
      if (userCount !== assignedUsers.length) {
        return badRequest('One or more assigned users do not exist');
      }
    }

    let task;
    try {
      task = await taskOwner.createTask({
        title,
        description,
        priority: priority || 'Medium',
        dueDate,
        category: category || 'Other',
        assignedUsers: assignedUsers || [],
        createdBy: userId
      });
    } catch (err) {
      if (err.code === 11000) {
        return conflict(`${ENTITY} already exists`);
      }
      return error(`Failed to create ${ENTITY}`, 500, err.message);
    }

    return success({ success: true, message: 'Task created successfully', task }, 201);
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

    let items, total;
    try {
      ({ items, total } = await taskQueries.findTasksPaginated(filter, {
        page: pageNum,
        limit: limitNum,
        sort: { createdAt: -1 },
        populate: [
          { path: 'assignedUsers', select: 'name email role' },
          { path: 'createdBy', select: 'name email' }
        ]
      }));
    } catch (err) {
      return error(`Failed to fetch ${ENTITY}s`, 500, err.message);
    }

    const totalPages = Math.ceil(total / limitNum);
    return success({
      tasks: items,
      pagination: {
        total,
        totalPages,
        currentPage: pageNum,
        perPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
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

    let items, total;
    try {
      ({ items, total } = await taskQueries.findTasksPaginated(filter, {
        page: pageNum,
        limit: limitNum,
        sort: { dueDate: 1 },
        populate: [
          { path: 'assignedUsers', select: 'name email role' },
          { path: 'createdBy', select: 'name email' }
        ]
      }));
    } catch (err) {
      return error(`Failed to fetch ${ENTITY}s`, 500, err.message);
    }

    const totalPages = Math.ceil(total / limitNum);
    return success({
      tasks: items,
      pagination: {
        total,
        totalPages,
        currentPage: pageNum,
        perPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
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

    const task = await taskQueries.findTaskById(taskId);
    if (!task) {
      return notFound(ENTITY);
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
    await taskOwner.persistTask(task);

    return success({ message: 'Task status updated successfully', task });
  }

  /**
   * Update task details
   * @param {string} taskId - Task ID
   * @param {Object} taskData - Update data
   */
  async updateTask(taskId, taskData) {
    const { title, description, priority, dueDate, category, assignedUsers } = taskData;

    const task = await taskQueries.findTaskById(taskId);
    if (!task) {
      return notFound(ENTITY);
    }

    if (assignedUsers) {
      const userCount = await userQueries.countUsers({ _id: { $in: assignedUsers } });
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

    const updatedTask = await taskOwner.persistTask(task);
    return success({ message: 'Task updated successfully', task: updatedTask });
  }

  /**
   * Delete task
   * @param {string} taskId - Task ID
   */
  async deleteTask(taskId) {
    let deleted;
    try {
      deleted = await taskOwner.deleteTaskById(taskId);
    } catch (err) {
      return error(`Failed to delete ${ENTITY}`, 500, err.message);
    }
    if (!deleted) {
      return notFound(ENTITY);
    }
    return { success: true, statusCode: 200, message: 'Task deleted successfully' };
  }
}

export const tasksService = new TasksService();
export default tasksService;
