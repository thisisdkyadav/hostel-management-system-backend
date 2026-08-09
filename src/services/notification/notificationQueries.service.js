/**
 * Notification Queries Service
 * ----------------------------
 * The single READ surface for the `Notification` collection. The notifications
 * app-service reads through these instead of importing the model, so it is
 * touched only inside `src/services/notification/` (writes live in
 * notificationOwner.service.js).
 *
 * The three list methods differ ONLY in their populate spec — kept as distinct
 * methods because each mirrors an exact original caller:
 *  - listForFilteredView → sender "name email" + hostelId "name"  (NO profileImage)
 *  - listForUser         → sender "name email profileImage"       (no hostel populate)
 *  - listForAdmin        → sender "name email profileImage" + hostelId "name"
 * All sort { createdAt: -1 } and paginate via { skip, limit }.
 */

import { Notification } from "../../models/index.js"

export const notificationQueries = {
  /** Filtered role-aware list (getAll): sender name/email + hostel name. */
  async listForFilteredView(query, { skip, limit }) {
    return Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name email")
      .populate("hostelId", "name")
  },

  /** Per-user feed (getNotificationsForUser): sender name/email/profileImage. */
  async listForUser(query, { skip, limit }) {
    return Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name email profileImage")
  },

  /** Admin list (getAllNotifications): sender name/email/profileImage + hostel name. */
  async listForAdmin(query, { skip, limit }) {
    return Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", "name email profileImage")
      .populate("hostelId", "name")
  },

  /** One notification (getNotificationById): sender name/email/profileImage + hostel name. */
  async findByIdDetailed(id) {
    return Notification.findById(id)
      .populate("sender", "name email profileImage")
      .populate("hostelId", "name")
  },

  /** Count notifications matching an arbitrary filter (stats / counts / paging). */
  async countNotifications(query = {}) {
    return Notification.countDocuments(query)
  },
}

export default notificationQueries
