/**
 * Notification Service
 * Handles notification operations
 * 
 * @module services/notification.service
 */

import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { emitNotificationEvent } from '../../../../utils/socketHandlers.js'
import { success, error } from '../../../../services/base/index.js';
import { notificationOwner } from '../../../../services/notification/notificationOwner.service.js';
import { notificationQueries } from '../../../../services/notification/notificationQueries.service.js';

class NotificationService {
  // ========== Controller Methods (for thin controller pattern) ==========

  /**
   * Create notification - Controller method
   * @param {Object} data - Notification data
   * @param {string} senderId - Sender user ID
   */
  async create(data, senderId) {
    const { title, message, type, hostelId, degree, department, gender, expiryDate } = data;

    try {
      const notification = await notificationOwner.createNotification({
        title,
        message,
        type,
        sender: senderId,
        hostelId,
        degree,
        department,
        gender,
        expiryDate
      });

      emitNotificationEvent({ id: notification?._id?.toString(), action: 'created' });

      return success({ message: 'Notification created successfully', notification }, 201);
    } catch (err) {
      return error('Internal server error', 500, err);
    }
  }

  /**
   * Get notifications - Controller method
   * @param {Object} query - Query parameters
   * @param {Object} user - User object
   */
  async getAll(query, user) {
    const { page, limit, type, hostelId, degree, department, gender, search, expiryStatus } = query;

    try {
      const queryObj = {};
      if (type) queryObj.type = type;

      if (user.role === 'Student') {
        const studentProfile = await studentProfileQueries.findByUserIdWithAllocationHostel(user._id);
        // A student without a profile simply sees broadcast notifications.
        const profileAttributes = studentProfile
          ? {
              hostelIdVal: studentProfile.currentRoomAllocation?.hostelId,
              gender: studentProfile.gender,
              degree: studentProfile.degree,
              department: studentProfile.department,
            }
          : { hostelIdVal: null, gender: null, degree: null, department: null };
        const { hostelIdVal, gender: studentGender, degree: studentDegree, department: studentDepartment } = profileAttributes;
        queryObj.$and = [
          { $or: [{ gender: null }, { gender: studentGender }] },
          { $or: [{ hostelId: { $size: 0 } }, { hostelId: null }, { hostelId: hostelIdVal }] },
          { $or: [{ degree: { $size: 0 } }, { degree: null }, { degree: studentDegree }] },
          { $or: [{ department: { $size: 0 } }, { department: null }, { department: studentDepartment }] }
        ];
      } else {
        // For non-student users
        if (hostelId) {
          const hostelIds = Array.isArray(hostelId) ? hostelId : [hostelId];
          queryObj.$or = [{ hostelId: { $size: 0 } }, { hostelId: null }, { hostelId: { $in: hostelIds } }];
        }
        if (degree) {
          const degrees = Array.isArray(degree) ? degree : [degree];
          queryObj.$and = queryObj.$and || [];
          queryObj.$and.push({
            $or: [{ degree: { $size: 0 } }, { degree: null }, { degree: { $in: degrees } }]
          });
        }
        if (department) {
          const departments = Array.isArray(department) ? department : [department];
          queryObj.$and = queryObj.$and || [];
          queryObj.$and.push({
            $or: [{ department: { $size: 0 } }, { department: null }, { department: { $in: departments } }]
          });
        }
        if (gender) queryObj.gender = gender;
      }

      if (expiryStatus) {
        const now = new Date();
        if (expiryStatus === 'active') {
          queryObj.expiryDate = { $gte: now };
        } else if (expiryStatus === 'expired') {
          queryObj.expiryDate = { $lt: now };
        }
      }

      if (user.hostel) {
        queryObj.hostelId = user.hostel._id;
      }

      if (search) {
        const regex = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        // sender/hostelId/degree/department are ObjectIds or arrays — regexing
        // them throws CastError. Text fields only; the UI filters the rest.
        queryObj.$or = [{ title: regex }, { message: regex }];
      }

      const pageInt = parseInt(page) || 1;
      const limitInt = parseInt(limit) || 10;
      const skip = (pageInt - 1) * limitInt;

      const notifications = await notificationQueries.listForFilteredView(queryObj, { skip, limit: limitInt });

      const totalNotifications = await notificationQueries.countNotifications(queryObj);
      const totalPages = Math.ceil(totalNotifications / limitInt);

      return success({
        data: notifications,
        meta: { totalCount: totalNotifications, totalPages, currentPage: pageInt }
      });
    } catch (err) {
      return error('Internal server error', 500, err);
    }
  }

  /**
   * Get notification stats - Controller method
   * @param {Object} user - User object
   */
  async getStats(user) {
    try {
      let queryObj = {};
      if (user.role === 'Student') {
        const studentProfile = await studentProfileQueries.findByUserIdWithAllocationHostel(user._id);
        // Profile-less students still get broadcast counts.
        const hostelId = studentProfile?.currentRoomAllocation?.hostelId ?? null;
        const gender = studentProfile?.gender ?? null;
        const degree = studentProfile?.degree ?? null;
        const department = studentProfile?.department ?? null;
        queryObj = {
          $and: [
            { $or: [{ gender: null }, { gender: gender }] },
            { $or: [{ hostelId: { $size: 0 } }, { hostelId: null }, { hostelId: hostelId }] },
            { $or: [{ degree: { $size: 0 } }, { degree: null }, { degree: degree }] },
            { $or: [{ department: { $size: 0 } }, { department: null }, { department: department }] }
          ]
        };
      }

      const now = new Date();
      const total = await notificationQueries.countNotifications(queryObj);
      const active = await notificationQueries.countNotifications({ ...queryObj, expiryDate: { $gte: now } });
      const expired = await notificationQueries.countNotifications({ ...queryObj, expiryDate: { $lt: now } });

      return success({ data: { total, active, expired } });
    } catch (err) {
      return error('Internal server error', 500, err);
    }
  }

  /**
   * Get active notifications count - Controller method
   * @param {Object} user - User object
   */
  async getActiveCount(user) {
    try {
      const now = new Date();
      let queryObj = {};
      if (user.role === 'Student') {
        const studentProfile = await studentProfileQueries.findByUserIdWithAllocationHostel(user._id);
        // Profile-less students still get broadcast counts.
        const hostelId = studentProfile?.currentRoomAllocation?.hostelId ?? null;
        const gender = studentProfile?.gender ?? null;
        const degree = studentProfile?.degree ?? null;
        const department = studentProfile?.department ?? null;
        queryObj = {
          $and: [
            { $or: [{ gender: null }, { gender: gender }] },
            { $or: [{ hostelId: { $size: 0 } }, { hostelId: hostelId }] },
            { $or: [{ degree: { $size: 0 } }, { degree: degree }] },
            { $or: [{ department: { $size: 0 } }, { department: department }] }
          ]
        };
      }

      const activeCount = await notificationQueries.countNotifications({ ...queryObj, expiryDate: { $gte: now } });

      return success({ activeCount });
    } catch (err) {
      return error('Internal server error', 500, err);
    }
  }

  // ========== Legacy Methods (for backwards compatibility) ==========

  /**
   * Create a notification (legacy)
   * @param {Object} options Notification options
   * @param {string} options.title Notification title
   * @param {string} options.message Notification message
   * @param {string} options.sender Sender user ID
   * @param {string} [options.type='announcement'] Notification type
   * @param {string[]} [options.hostelId] Target hostel IDs
   * @param {string[]} [options.degree] Target degrees
   * @param {string[]} [options.department] Target departments
   * @param {string} [options.gender] Target gender
   * @param {Date} [options.expiryDate] Expiry date
   * @returns {Promise<Object>}
   */
  async createNotification({
    title,
    message,
    sender,
    type = 'announcement',
    hostelId = [],
    degree = [],
    department = [],
    gender = null,
    expiryDate = null
  }) {
    if (!title || !message || !sender) {
      throw new Error('Title, message, and sender are required')
    }

    const notificationData = {
      title,
      message,
      sender,
      type,
      hostelId,
      degree,
      department
    }

    if (gender) {
      notificationData.gender = gender
    }

    if (expiryDate) {
      notificationData.expiryDate = expiryDate
    }

    const notification = await notificationOwner.createNotification(notificationData)
    emitNotificationEvent({ id: notification?._id?.toString(), action: 'created' })
    return notification
  }

  /**
   * Get notifications for a user
   * @param {Object} options Query options
   * @param {string} [options.hostelId] User's hostel ID
   * @param {string} [options.degree] User's degree
   * @param {string} [options.department] User's department
   * @param {string} [options.gender] User's gender
   * @param {number} [options.page=1] Page number
   * @param {number} [options.limit=20] Items per page
   * @returns {Promise<{notifications: Array, total: number, pages: number}>}
   */
  async getNotificationsForUser({
    hostelId,
    degree,
    department,
    gender,
    page = 1,
    limit = 20
  }) {
    const query = {
      expiryDate: { $gte: new Date() }
    }

    // Build OR conditions for targeting
    const orConditions = []

    // Match hostel if specified in notification
    if (hostelId) {
      orConditions.push({ hostelId: { $size: 0 } }) // No hostel filter
      orConditions.push({ hostelId: hostelId })
    } else {
      orConditions.push({ hostelId: { $size: 0 } })
    }

    // Match degree if specified
    if (degree) {
      orConditions.push({ degree: { $size: 0 } })
      orConditions.push({ degree: degree })
    }

    // Match department if specified
    if (department) {
      orConditions.push({ department: { $size: 0 } })
      orConditions.push({ department: department })
    }

    // Match gender if specified
    if (gender) {
      query.$or = [
        { gender: { $exists: false } },
        { gender: null },
        { gender: gender }
      ]
    }

    const skip = (page - 1) * limit

    const [notifications, total] = await Promise.all([
      notificationQueries.listForUser(query, { skip, limit }),
      notificationQueries.countNotifications(query)
    ])

    return {
      notifications,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    }
  }

  /**
   * Get all notifications (admin view)
   * @param {Object} options Query options
   * @param {number} [options.page=1] Page number
   * @param {number} [options.limit=20] Items per page
   * @param {boolean} [options.includeExpired=false] Include expired notifications
   * @returns {Promise<{notifications: Array, total: number, pages: number}>}
   */
  async getAllNotifications({ page = 1, limit = 20, includeExpired = false }) {
    const query = includeExpired ? {} : { expiryDate: { $gte: new Date() } }
    const skip = (page - 1) * limit

    const [notifications, total] = await Promise.all([
      notificationQueries.listForAdmin(query, { skip, limit }),
      notificationQueries.countNotifications(query)
    ])

    return {
      notifications,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page
    }
  }

  /**
   * Get notification by ID
   * @param {string} notificationId Notification ID
   * @returns {Promise<Object|null>}
   */
  async getNotificationById(notificationId) {
    const notification = await notificationQueries.findByIdDetailed(notificationId)

    return notification
  }

  /**
   * Delete a notification
   * @param {string} notificationId Notification ID
   * @returns {Promise<boolean>}
   */
  async deleteNotification(notificationId) {
    const result = await notificationOwner.deleteNotificationById(notificationId)
    if (result) {
      emitNotificationEvent({ id: notificationId?.toString(), action: 'deleted' })
    }
    return !!result
  }

  /**
   * Delete expired notifications
   * @returns {Promise<number>} Number of deleted notifications
   */
  async deleteExpiredNotifications() {
    const result = await notificationOwner.deleteExpiredNotifications()
    return result.deletedCount
  }

  /**
   * Update a notification
   * @param {string} notificationId Notification ID
   * @param {Object} updates Update data
   * @returns {Promise<Object|null>}
   */
  async updateNotification(notificationId, updates) {
    const allowedUpdates = ['title', 'message', 'hostelId', 'degree', 'department', 'gender', 'expiryDate']
    const filteredUpdates = {}

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key]
      }
    }

    const notification = await notificationOwner.updateNotificationById(notificationId, filteredUpdates)

    if (notification) {
      emitNotificationEvent({ id: notification._id?.toString(), action: 'updated' })
    }
    return notification
  }

  /**
   * Get notification count for a user
   * @param {Object} options User options
   * @returns {Promise<number>}
   */
  async getNotificationCount({ hostelId, degree, department, gender }) {
    const query = {
      expiryDate: { $gte: new Date() }
    }

    if (gender) {
      query.$or = [
        { gender: { $exists: false } },
        { gender: null },
        { gender: gender }
      ]
    }

    return notificationQueries.countNotifications(query)
  }
}

// Export singleton instance
export const notificationService = new NotificationService()
export default notificationService
