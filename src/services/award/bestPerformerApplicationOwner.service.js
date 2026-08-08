/**
 * Overall Best Performer Application Owner Service
 * -----------------------------------------------
 * The single WRITE surface for the OverallBestPerformerApplication collection
 * (a student's award application with scored sections + HOD verifications).
 * Every instantiation/persist goes through here so the model is mutated only
 * inside `src/services/award/` (reads live in
 * bestPerformerApplicationQueries.service.js).
 *
 * The upsert path fetches an existing application (queries) or builds a fresh
 * unsaved one via newApplication(seed), mutates it heavily, then persists via
 * persistApplication. A unique {occurrenceId, studentUserId} index enforces one
 * application per student per occurrence (preserved as-is — a rare concurrent
 * double-submit by the same student would surface as an E11000, exactly as
 * before this migration).
 */

import { OverallBestPerformerApplication } from "../../models/index.js"

export const bestPerformerApplicationOwner = {
  /** Build a fresh (unsaved) application instance from seed fields. */
  newApplication(seed) {
    return new OverallBestPerformerApplication(seed)
  },

  /** Persist a hydrated application doc (new or mutated existing). Returns the doc. */
  async persistApplication(application) {
    return application.save()
  },
}

export default bestPerformerApplicationOwner
