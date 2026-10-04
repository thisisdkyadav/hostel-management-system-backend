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

import { AccommodationRequest, AccommodationType, InvoiceCounter, AccommodationBatch, AccommodationReservation, AccommodationNotification } from "../../models/index.js"

export const accommodationOwner = {
  async queueH4Notification(requestId, revision, { session } = {}) {
    return AccommodationNotification.findOneAndUpdate({ requestId },
      { $max: { revision }, $set: { pending: true, nextAttemptAt: new Date(), attempts: 0 } }, { upsert: true, returnDocument: "after", session })
  },
  async claimH4Notification() {
    return AccommodationNotification.findOneAndUpdate({ pending: true, nextAttemptAt: { $lte: new Date() }, $or: [{ leaseUntil: null }, { leaseUntil: { $lte: new Date() } }] },
      { $set: { leaseUntil: new Date(Date.now() + 10 * 60000) }, $inc: { attempts: 1 } }, { sort: { nextAttemptAt: 1 }, returnDocument: "after" }).lean()
  },
  async completeH4Notification(job, error = "") {
    const result = await AccommodationNotification.updateOne({ _id: job._id, revision: job.revision, leaseUntil: job.leaseUntil },
      { $set: { pending: !!error, leaseUntil: null, lastError: error, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(job.attempts, 6))) } })
    if (!result.matchedCount) await AccommodationNotification.updateOne({ _id: job._id, leaseUntil: job.leaseUntil }, { $set: { leaseUntil: null } })
    return result
  },
  async setNotificationError(requestId, message) {
    return AccommodationRequest.updateOne({ _id: requestId, typeKey: "intern" }, { $set: { "h4.lastNotificationError": message } })
  },
  async createBatch(data, { session } = {}) {
    const batch = new AccommodationBatch(data)
    await batch.save({ session })
    return batch
  },
  async reserve(data, { session } = {}) {
    return AccommodationReservation.findOneAndUpdate({ requestId: data.requestId },
      { $set: { ...data, active: true, releasedAt: null, releaseReason: "" } },
      { returnDocument: "after", upsert: true, runValidators: true, session })
  },
  async releaseReservation(requestId, reason, { session } = {}) {
    return AccommodationReservation.updateOne({ requestId, active: true },
      { $set: { active: false, releasedAt: new Date(), releaseReason: reason } }, { session })
  },
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

  // ==================== InvoiceCounter ====================

  /**
   * Claim the next serial in an invoice series. Atomic $inc with upsert, so two
   * invoices issued at the same instant can never take the same number and the
   * series stays consecutive.
   */
  async nextInvoiceSerial(seriesKey) {
    const counter = await InvoiceCounter.findOneAndUpdate(
      { key: seriesKey },
      { $inc: { lastSerial: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
    return counter.lastSerial
  },

  // ==================== AccommodationType ====================

  /** Idempotently seed a default type without overwriting edited ones. */
  async upsertDefaultType(key, doc) {
    return AccommodationType.updateOne({ key }, { $setOnInsert: doc }, { upsert: true })
  },
}

export default accommodationOwner
