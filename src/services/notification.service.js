/**
 * Notification Service
 * Handles notification operations
 */

import Notification from '../../models/Notification.js'

class NotificationService {
  /**
   * Create a notification
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

    const notification = await Notification.create(notificationData)
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
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'name email profileImage'),
      Notification.countDocuments(query)
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
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('sender', 'name email profileImage')
        .populate('hostelId', 'name'),
      Notification.countDocuments(query)
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
    const notification = await Notification.findById(notificationId)
      .populate('sender', 'name email profileImage')
      .populate('hostelId', 'name')

    return notification
  }

  /**
   * Delete a notification
   * @param {string} notificationId Notification ID
   * @returns {Promise<boolean>}
   */
  async deleteNotification(notificationId) {
    const result = await Notification.findByIdAndDelete(notificationId)
    return !!result
  }

  /**
   * Delete expired notifications
   * @returns {Promise<number>} Number of deleted notifications
   */
  async deleteExpiredNotifications() {
    const result = await Notification.deleteMany({
      expiryDate: { $lt: new Date() }
    })
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

    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      filteredUpdates,
      { new: true }
    )
      .populate('sender', 'name email profileImage')
      .populate('hostelId', 'name')

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

    return Notification.countDocuments(query)
  }
}

// Export singleton instance
export const notificationService = new NotificationService()
export default notificationService
