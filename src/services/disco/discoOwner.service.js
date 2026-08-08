/**
 * DisCo Owner Service
 * -------------------
 * The single WRITE surface for the entire Disciplinary Committee domain —
 * both the `DisCoAction` (final disciplinary actions) and `DisCoProcessCase`
 * (admin-driven processing workflow) collections. Per the domain-ownership
 * rule, these two models are mutated ONLY inside `src/services/disco/`; the
 * disco app-service routes every write through here (reads live in
 * discoQueries.service.js).
 *
 * Combined into one owner because the two collections form a single domain:
 * a finalized process case creates DisCoAction documents. Methods are
 * model-qualified (Action vs ProcessCase) to keep intent explicit.
 *
 * Semantics preserved exactly:
 *  - updateActionById uses { new: true, runValidators: true } — matching the
 *    BaseService.updateById the app-service previously inherited.
 *  - persistAction / persistProcessCase run `.save()` on a hydrated doc so the
 *    mutate-then-save flows (mark-reminder-done, every case stage transition)
 *    keep their exact behavior.
 *  - insertActions is a bare insertMany (no per-doc hooks on this model).
 */

import { DisCoAction, DisCoProcessCase } from "../../models/index.js"

export const discoOwner = {
  // ==================== DisCoAction ====================

  /** Create a final disciplinary action. Throws on error (caller maps envelope). */
  async createAction(data) {
    return DisCoAction.create(data)
  },

  /** Bulk-create disciplinary actions (finalize case). Returns created docs. */
  async insertActions(actionDocuments) {
    return DisCoAction.insertMany(actionDocuments)
  },

  /**
   * Update a disciplinary action by id.
   * { new: true, runValidators: true } mirrors the old BaseService.updateById.
   * Returns the updated doc or null (not found).
   */
  async updateActionById(id, updates) {
    return DisCoAction.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
  },

  /** Delete a disciplinary action by id. Returns the deleted doc or null. */
  async deleteActionById(id) {
    return DisCoAction.findByIdAndDelete(id)
  },

  /** Persist a hydrated DisCoAction doc (mutate-then-save: mark reminder done). */
  async persistAction(actionDoc) {
    return actionDoc.save()
  },

  // ==================== DisCoProcessCase ====================

  /** Create a disciplinary process case. */
  async createProcessCase(data) {
    return DisCoProcessCase.create(data)
  },

  /**
   * Persist a hydrated DisCoProcessCase doc. Backs every stage transition:
   * stage-2 save, committee email send/skip, minutes upload, finalize.
   */
  async persistProcessCase(caseDoc) {
    return caseDoc.save()
  },
}

export default discoOwner
