/**
 * Overall Best Performer Application Queries Service
 * -------------------------------------------------
 * The single READ surface for the OverallBestPerformerApplication collection.
 * The best-performer app-service reads through these instead of importing the
 * model, so it is touched only inside `src/services/award/` (writes live in
 * bestPerformerApplicationOwner.service.js).
 *
 * populate/select/sort/lean choices mirror each original caller EXACTLY. Bare
 * findById/findOne return hydrated docs (mutate-then-persist).
 */

import { OverallBestPerformerApplication } from "../../models/index.js"

export const bestPerformerApplicationQueries = {
  /** A student's latest application with its occurrence populated (hydrated). */
  async findApplicationByStudent(userId) {
    return OverallBestPerformerApplication.findOne({ studentUserId: userId })
      .populate("occurrenceId")
      .sort({ submittedAt: -1, createdAt: -1 })
  },

  /** A student's application for a specific occurrence (hydrated; upsert lookup). */
  async findApplicationByOccurrenceAndStudent(occurrenceId, studentUserId) {
    return OverallBestPerformerApplication.findOne({ occurrenceId, studentUserId })
  },

  /** All applications for an occurrence, leaderboard-sorted, lean (detail view). */
  async findApplicationsByOccurrence(occurrenceId) {
    return OverallBestPerformerApplication.find({ occurrenceId })
      .populate("studentUserId", "name email profileImage")
      .populate("hodVerifications.verifiedBy", "name email")
      .sort({ "review.finalScore": -1, "scoreBreakdown.total": -1, updatedAt: 1 })
      .lean()
  },

  /** Application by id (hydrated — mutate-then-persist). */
  async findApplicationById(id) {
    return OverallBestPerformerApplication.findById(id)
  },

  /** Application by id with student + HOD-verifier refs populated (post-write refetch). */
  async findApplicationByIdPopulated(id) {
    return OverallBestPerformerApplication.findById(id)
      .populate("studentUserId", "name email profileImage")
      .populate("hodVerifications.verifiedBy", "name email")
  },

  /** Application by id with only HOD-verifier refs populated (verification refetch). */
  async findApplicationByIdWithHodVerifiers(id) {
    return OverallBestPerformerApplication.findById(id).populate(
      "hodVerifications.verifiedBy",
      "name email"
    )
  },
}

export default bestPerformerApplicationQueries
