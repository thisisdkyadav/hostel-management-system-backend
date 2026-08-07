/**
 * Inventory Owner Service
 * -----------------------
 * The single owner of all WRITES to the inventory domain's three collections
 * (InventoryItemType, HostelInventory, StudentInventory). Every module that
 * changes inventory state goes through these operations instead of touching the
 * models directly.
 *
 * Invariant guaranteed on commit:
 *   - HostelInventory.availableCount is mutated ONLY via atomic guarded updates
 *     ($inc), never read-modify-write. A guarded decrement (availableCount >=
 *     count) makes it impossible to issue more items than are available, even
 *     under concurrent issues — the last unit can't be double-issued and the
 *     count can't go negative.
 *   - Issue = reserve stock + create the StudentInventory record in ONE
 *     transaction (all-or-nothing); a create failure rolls the reserve back.
 *   - Return = flip the StudentInventory to Returned + release the stock in ONE
 *     transaction.
 *
 * How this replaces the old code:
 *   - The services did `if (available < n) …; available -= n; save()` — a
 *     check-then-act RMW that oversells under concurrency. That is now
 *     reserveHostelStock's single atomic conditional $inc.
 *   - The dead `HostelInventory.updateAvailableCount` static (RMW) and the
 *     silently-failing `StudentInventory` post('save') hook that called it with
 *     mismatched args are removed from the models; this service owns the count.
 *
 * findOneAndUpdate bypasses the schema pre('save') updatedAt hook, so these
 * updates set updatedAt explicitly.
 */

import { InventoryItemType, HostelInventory, StudentInventory } from "../../models/index.js"
import { withTransaction } from "../base/index.js"

export const inventoryOwner = {
  // ==================== InventoryItemType ====================

  async createItemType(data) {
    return InventoryItemType.create(data)
  },

  async updateItemTypeById(id, updates) {
    return InventoryItemType.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
  },

  async deleteItemTypeById(id) {
    return InventoryItemType.findByIdAndDelete(id)
  },

  // ==================== HostelInventory (allocation) ====================

  /** Create a fresh hostel allocation (available starts equal to allocated). */
  async createHostelAllocation({ hostelId, itemTypeId, allocatedCount }) {
    return HostelInventory.create({
      hostelId,
      itemTypeId,
      allocatedCount,
      availableCount: allocatedCount,
    })
  },

  /**
   * Adjust an existing allocation atomically: set the new allocatedCount and
   * $inc availableCount by the delta (newAllocated - oldAllocated). Expressing
   * the available change as a delta keeps it correct against concurrent issues
   * (which also $inc availableCount) — no lost update.
   */
  async adjustHostelAllocation(id, { newAllocatedCount, availableDelta }, { session } = {}) {
    return HostelInventory.findOneAndUpdate(
      { _id: id },
      {
        $set: { allocatedCount: newAllocatedCount, updatedAt: new Date() },
        $inc: { availableCount: availableDelta },
      },
      { new: true, ...(session ? { session } : {}) }
    )
  },

  /**
   * Atomically reserve `count` units from a hostel allocation. Returns the
   * updated doc, or null when there is not enough available (the guard
   * availableCount >= count failed) — the caller reports insufficient stock.
   */
  async reserveHostelStock(hostelInventoryId, count, { session } = {}) {
    return HostelInventory.findOneAndUpdate(
      { _id: hostelInventoryId, availableCount: { $gte: count } },
      { $inc: { availableCount: -count }, $set: { updatedAt: new Date() } },
      { new: true, ...(session ? { session } : {}) }
    )
  },

  /** Atomically release `count` units back to a hostel allocation. */
  async releaseHostelStock(hostelInventoryId, count, { session } = {}) {
    return HostelInventory.findOneAndUpdate(
      { _id: hostelInventoryId },
      { $inc: { availableCount: count }, $set: { updatedAt: new Date() } },
      { new: true, ...(session ? { session } : {}) }
    )
  },

  async deleteHostelAllocationById(id) {
    return HostelInventory.findByIdAndDelete(id)
  },

  // ==================== StudentInventory (issue / return / status) ====================

  /**
   * Issue items to a student: reserve the stock (atomic guard) AND create the
   * issue record in one transaction. Returns { ok:true, doc } on success, or
   * { ok:false, insufficient:true } when the guarded reserve fails (raced out
   * of stock).
   */
  async issueToStudent(issueData) {
    const { hostelInventoryId, count } = issueData
    // Insufficient stock is a common, expected outcome, so signal it by RETURNING
    // from the txn callback (empty commit, nothing written) rather than throwing —
    // a throw would make withTransaction log a scary "Transaction failed" line on
    // every out-of-stock attempt. A genuine create failure still throws → rollback.
    return withTransaction(async (session) => {
      const reserved = await this.reserveHostelStock(hostelInventoryId, count, { session })
      if (!reserved) return { ok: false, insufficient: true }
      const [created] = await StudentInventory.create([issueData], { session })
      return { ok: true, doc: created }
    })
  },

  /**
   * Return a student's issued items: flip to Returned and release the stock in
   * one transaction. `apply` mutates the loaded studentInventory doc before it
   * is saved (status/returnDate/returnedBy/condition/notes).
   */
  async returnFromStudent(studentInventory, apply) {
    return withTransaction(async (session) => {
      apply(studentInventory)
      await studentInventory.save({ session })
      await this.releaseHostelStock(studentInventory.hostelInventoryId, studentInventory.count, {
        session,
      })
      return studentInventory
    })
  },

  /** Persist a mutated student-inventory doc (status change with no count effect). */
  async persistStudentInventory(studentInventory) {
    await studentInventory.save()
    return studentInventory
  },
}

export default inventoryOwner
