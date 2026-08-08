/**
 * POR Category Owner Service
 * --------------------------
 * The single WRITE surface for the PorCategory collection (admin-defined POR
 * approval-chain templates, incl. legacy club-linked categories). Every
 * create/persist goes through here so the model is mutated only inside
 * `src/services/club/` (reads live in porCategoryQueries.service.js).
 */

import { PorCategory } from "../../models/index.js"

export const porCategoryOwner = {
  /** Create a POR category. Returns the created doc. */
  async createCategory(data) {
    return PorCategory.create(data)
  },

  /** Persist a hydrated POR category doc mutated by the caller. Returns the doc. */
  async persistCategory(category) {
    return category.save()
  },
}

export default porCategoryOwner
