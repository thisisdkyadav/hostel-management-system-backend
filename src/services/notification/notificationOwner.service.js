/**
 * Notification Owner Service
 * --------------------------
 * The single WRITE surface for the `Notification` collection (user
 * notifications / announcements). Per the domain-ownership rule, the model is
 * mutated ONLY inside `src/services/notification/`; the notifications
 * app-service routes every write through here (reads live in
 * notificationQueries.service.js).
 *
 * No pre-save hook on this model (the `expiryDate` default is a schema default
 * fn that fires on create), so createNotification is a plain create — it is
 * equivalent to the old `new Notification(data).save()` AND `Notification.create(data)`.
 */

import { Notification } from "../../models/index.js"

export const notificationOwner = {
  /** Create a notification (expiryDate schema default fires when omitted). */
  async createNotification(data) {
    return Notification.create(data)
  },

  /**
   * Update a notification by id, returning the updated doc with sender +
   * hostels populated. { new: true } only (matches the original). Returns doc
   * or null.
   */
  async updateNotificationById(id, updates) {
    return Notification.findByIdAndUpdate(id, updates, { new: true })
      .populate("sender", "name email profileImage")
      .populate("hostelId", "name")
  },

  /** Delete a notification by id. Returns the deleted doc or null. */
  async deleteNotificationById(id) {
    return Notification.findByIdAndDelete(id)
  },

  /** Delete all expired notifications. Returns the raw deleteMany result. */
  async deleteExpiredNotifications() {
    return Notification.deleteMany({ expiryDate: { $lt: new Date() } })
  },
}

export default notificationOwner
