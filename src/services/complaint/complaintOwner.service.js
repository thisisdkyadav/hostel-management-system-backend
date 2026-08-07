/**
 * Complaint Owner Service
 * -----------------------
 * The single owner of all WRITES to the Complaint + FeedbackToken collections.
 * The complaints app-service creates/mutates complaints (status, resolution,
 * feedback) and marks legacy feedback tokens used through here; nothing else
 * writes these collections. Neither model has cross-model hooks (Complaint only
 * has a pre-save updatedAt), so persist() is a plain save.
 */

import { Complaint } from "../../models/index.js"

export const complaintOwner = {
  /** Create a complaint; returns the created doc. */
  async createComplaint(data) {
    return Complaint.create(data)
  },

  /** Persist a mutated hydrated complaint (status / resolution notes). */
  async persistComplaint(complaint) {
    await complaint.save()
    return complaint
  },

  /** Update a complaint by id; returns the updated doc or null. */
  async updateComplaintById(complaintId, updates) {
    return Complaint.findByIdAndUpdate(complaintId, updates, { new: true })
  },

  /** Mark a legacy feedback token used (the token doc is loaded via queries). */
  async markFeedbackTokenUsed(feedbackToken) {
    feedbackToken.used = true
    await feedbackToken.save()
    return feedbackToken
  },
}

export default complaintOwner
