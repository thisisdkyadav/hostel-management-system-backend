/**
 * Accommodation Owner Service
 * ---------------------------
 * The single owner of all WRITES to the AccommodationRequest + AccommodationType
 * collections. The accommodation workflow service builds/mutates a hydrated
 * request document (status transitions, approvals, payment, room assignment) and
 * persists it here; nothing else writes these collections.
 *
 * The request is a workflow document mutated in the app-layer state machine, so
 * this owner is intentionally a thin persistence seam (buildRequest / persist)
 * rather than a set of granular field mutators — it keeps every DB write for the
 * collection inside this directory (the enforceable boundary) while the workflow
 * logic stays in accommodation.service.js. Guest-room holds are NOT done here:
 * rooms are owned by the hostel roomOwner, which the workflow calls directly for
 * atomic Active<->Guest flips.
 *
 * AccommodationRequest has no cross-model hooks (only a pre-save updatedAt), so
 * persist() is a plain save.
 */

import { AccommodationRequest, AccommodationType } from "../../models/index.js"

export const accommodationOwner = {
  // ==================== AccommodationRequest ====================

  /** Build a new (unsaved) hydrated request; caller routes/mutates then persists. */
  buildRequest(data) {
    return new AccommodationRequest(data)
  },

  /** Persist a hydrated request (new or mutated). Optional session for txn use. */
  async persist(request, { session } = {}) {
    await request.save(session ? { session } : undefined)
    return request
  },

  // ==================== AccommodationType ====================

  /** Idempotently seed a default type without overwriting edited ones. */
  async upsertDefaultType(key, doc) {
    return AccommodationType.updateOne({ key }, { $setOnInsert: doc }, { upsert: true })
  },
}

export default accommodationOwner
