/**
 * POR Category Queries Service
 * ----------------------------
 * The single READ surface for the PorCategory collection. The POR app-service
 * reads through these instead of importing the model, so PorCategory is touched
 * only inside `src/services/club/` (writes live in
 * porCategoryOwner.service.js).
 *
 * select/populate/lean choices mirror each original caller EXACTLY. Bare
 * findById/findOne return hydrated docs (mutate-then-persist).
 */

import { PorCategory } from "../../models/index.js"

export const porCategoryQueries = {
  /** Category by id (hydrated — mutate-then-persist on update). */
  async findCategoryById(id) {
    return PorCategory.findById(id)
  },

  /** Category by name (caller builds the case-insensitive query), lean. */
  async findByName(query) {
    return PorCategory.findOne(query).select("_id name").lean()
  },

  /** Category fields needed to build a submission's approval chain (hydrated). */
  async findByIdForSubmission(id) {
    return PorCategory.findById(id).select("_id name gymkhanaSteps legacyGymkhanaCategoryKey")
  },

  /**
   * All categories, alphabetical, lean. When includeStepReviewers is set the
   * per-step reviewer users are populated (admin category management view).
   */
  async listCategories({ includeStepReviewers = false } = {}) {
    const query = PorCategory.find().sort({ name: 1 })
    if (includeStepReviewers) {
      query.populate("gymkhanaSteps.reviewerUserIds", "name email subRole role")
    }
    return query.lean()
  },

  /** Legacy club-linked category by legacyClubId (hydrated — sync mutate+persist). */
  async findByLegacyClubId(legacyClubId) {
    return PorCategory.findOne({ legacyClubId })
  },

  /** Legacy club-linked category with the migration fields (hydrated). */
  async findByLegacyClubIdForMigration(clubId) {
    return PorCategory.findOne({ legacyClubId: clubId }).select(
      "_id name gymkhanaSteps legacyGymkhanaCategoryKey"
    )
  },
}

export default porCategoryQueries
