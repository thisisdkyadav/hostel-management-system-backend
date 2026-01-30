/**
 * Task Service
 * Contains all business logic for task operations.
 * 
 * @module services/task
 */

import Task from '../../models/Task.js';
import User from '../../models/User.js';

class TaskService {
  /**
   * Create a new task
   */
  async createTask(taskData, userId) {
    const { title, description, priority, dueDate, category, assignedUsers } = taskData;

    if (!title || !description || !dueDate) {
      return { success: false, statusCode: 400, message: 'Title, description, and due date are required' };
    }

    if (assignedUsers && assignedUsers.length > 0) {
      const userCount = await User.countDocuments({
        _id: { $in: assignedUsers },
      });

      if (userCount !== assignedUsers.length) {
        return { success: false, statusCode: 400, message: 'One or more assigned users do not exist' };
      }
    }

    const newTask = new Task({
      title,
      description,
      priority: priority || 'Medium',
      dueDate,
      category: category || 'Other',
      assignedUsers: assignedUsers || [],
      createdBy: userId,
    });

    const savedTask = await newTask.save();

    return {
      success: true,
      statusCode: 201,
      data: {
        success: true,
        message: 'Task created successfully',
        task: savedTask,
      },
    };
  }

  /**
   * Get all tasks with pagination
   */
  async getAllTasks({ status, category, priority, page = 1, limit = 12 }) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return { success: false, statusCode: 400, message: 'Invalid pagination parameters' };
    }

    const filter = {};
    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    const totalTasks = await Task.countDocuments(filter);
    const totalPages = Math.ceil(totalTasks / limitNum);
    const skip = (pageNum - 1) * limitNum;

    const tasks = await Task.find(filter)
      .populate('assignedUsers', 'name email role')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    return {
      success: true,
      statusCode: 200,
      data: {
        tasks,
        pagination: {
          total: totalTasks,
          totalPages,
          currentPage: pageNum,
          perPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
    };
  }

  /**
   * Get tasks assigned to a specific user with pagination
   */
  async getUserTasks(userId, { status, category, priority, page = 1, limit = 12 }) {
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);

    if (isNaN(pageNum) || isNaN(limitNum) || pageNum < 1 || limitNum < 1) {
      return { success: false, statusCode: 400, message: 'Invalid pagination parameters' };
    }

    const filter = {
      assignedUsers: userId,
    };

    if (status) filter.status = status;
    if (category) filter.category = category;
    if (priority) filter.priority = priority;

    const totalTasks = await Task.countDocuments(filter);
    const totalPages = Math.ceil(totalTasks / limitNum);
    const skip = (pageNum - 1) * limitNum;

    const tasks = await Task.find(filter)
      .populate('assignedUsers', 'name email role')
      .populate('createdBy', 'name email')
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(limitNum);

    return {
      success: true,
      statusCode: 200,
      data: {
        tasks,
        pagination: {
          total: totalTasks,
          totalPages,
          currentPage: pageNum,
          perPage: limitNum,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
    };
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId, status, user) {
    const validStatuses = ['Created', 'Assigned', 'In Progress', 'Completed'];
    if (!validStatuses.includes(status)) {
      return { success: false, statusCode: 400, message: 'Invalid status value' };
    }

    const task = await Task.findById(taskId);

    if (!task) {
      return { success: false, statusCode: 404, message: 'Task not found' };
    }

    const isAdmin = user.role === 'Admin' || user.role === 'Super Admin';
    const isAssigned = task.assignedUsers.some((u) => u.toString() === user._id.toString());

    if (!isAdmin && !isAssigned) {
      return { success: false, statusCode: 403, message: 'Not authorized to update this task' };
    }

    if (!isAdmin && isAssigned) {
      if (status === 'Created' || status === 'Assigned') {
        return { success: false, statusCode: 403, message: 'Assigned users can only update status to In Progress or Completed' };
      }
    }

    task.status = status;
    task.updatedAt = Date.now();

    await task.save();

    return {
      success: true,
      statusCode: 200,
      data: {
        message: 'Task status updated successfully',
        task,
      },
    };
  }

  /**
   * Update task details
   */
  async updateTask(taskId, taskData) {
    const { title, description, priority, dueDate, category, assignedUsers } = taskData;

    const task = await Task.findById(taskId);

    if (!task) {
      return { success: false, statusCode: 404, message: 'Task not found' };
    }

    if (assignedUsers) {
      const userCount = await User.countDocuments({
        _id: { $in: assignedUsers },
      });

      if (userCount !== assignedUsers.length) {
        return { success: false, statusCode: 400, message: 'One or more assigned users do not exist' };
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

    return {
      success: true,
      statusCode: 200,
      data: {
        message: 'Task updated successfully',
        task: updatedTask,
      },
    };
  }

  /**
   * Delete task
   */
  async deleteTask(taskId) {
    const deletedTask = await Task.findByIdAndDelete(taskId);

    if (!deletedTask) {
      return { success: false, statusCode: 404, message: 'Task not found' };
    }

    return { success: true, statusCode: 200, message: 'Task deleted successfully' };
  }
}

export const taskService = new TaskService();
export default taskService;
