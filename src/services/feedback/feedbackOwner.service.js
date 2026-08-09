/**
 * Feedback Owner Service
 * ----------------------
 * The single WRITE surface for the `Feedback` collection (student feedback
 * submissions). Per the domain-ownership rule, the model is mutated ONLY inside
 * `src/services/feedback/`; the feedback app-service routes every write through
 * here (reads live in feedbackQueries.service.js).
 *
 * No pre-save hook (createdAt is a schema default). updateFeedbackById uses
 * { new: true, runValidators: true } to match the BaseService.updateById the
 * app-service previously inherited.
 */

import { Feedback } from "../../models/index.js"

export const feedbackOwner = {
  /** Create a feedback submission. Throws on error (caller maps envelope). */
  async createFeedback(data) {
    return Feedback.create(data)
  },

  /**
   * Update a feedback by id ({ new: true, runValidators: true }, matching the
   * old BaseService.updateById). Returns the updated doc or null (not found).
   */
  async updateFeedbackById(id, updates) {
    return Feedback.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
  },

  /** Delete a feedback by id. Returns the deleted doc or null. */
  async deleteFeedbackById(id) {
    return Feedback.findByIdAndDelete(id)
  },
}

export default feedbackOwner
