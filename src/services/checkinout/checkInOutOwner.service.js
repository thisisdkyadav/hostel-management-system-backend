/**
 * CheckInOut Owner Service
 * ------------------------
 * The single owner of all WRITES to the CheckInOut collection (campus gate
 * check-in/out log). The security and face-scanner modules record and edit
 * entries through here; nothing else writes this collection.
 *
 * CheckInOut is an append-only event log — no unique constraint, no counters —
 * so each write is an independent append/edit with no concurrency hazard. The
 * model has no hooks.
 */

import { CheckInOut } from "../../models/index.js"

export const checkInOutOwner = {
  /** Record a new check-in/out entry; returns the hydrated doc (for socket emit). */
  async createEntry(data) {
    return CheckInOut.create(data)
  },

  /** Persist a mutated hydrated entry (security edit). */
  async persistEntry(entry) {
    await entry.save()
    return entry
  },

  /** Update an entry by id; returns the updated doc or null. */
  async updateEntryById(entryId, updates) {
    return CheckInOut.findByIdAndUpdate(entryId, updates, { new: true })
  },

  /** Delete an entry by id; returns the deleted doc or null. */
  async deleteEntryById(entryId) {
    return CheckInOut.findByIdAndDelete(entryId)
  },
}

export default checkInOutOwner
