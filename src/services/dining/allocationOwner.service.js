/**
 * Dining Allocation Owner Service
 * -------------------------------
 * The single owner of all WRITES to DiningAllocation + the per-caterer
 * `catererCapacities[].allocatedCount` counter that lives on DiningPeriod.
 *
 * That counter is a denormalized seat tally maintained alongside the actual
 * DiningAllocation rows, so any code path that creates/moves/removes an
 * allocation must keep it in sync atomically or it drifts (over-capacity,
 * negative, wrong "remaining seats"). Historically two writers touched it — the
 * student self-select flow and (indirectly) the period edit — with no single
 * guard. Every seat change now goes through here:
 *
 *   - reserveSeat: atomic guarded increment so allocatedCount never exceeds
 *     maxStudentCount unless `force` is set (admin override).
 *     Live dining uses an exact-count compare-and-set (retried). The HTTP
 *     simulator passes `atomicCapacityInc: true` for a single conditional $inc
 *     (`allocatedCount < maxStudentCount`) with no retry loop.
 *   - releaseSeat: guarded decrement (never below 0).
 *   - assign / move / remove: DiningAllocation row + the matching seat change in
 *     ONE transaction, so the row and the counter can't diverge on a crash.
 *   - reconcileAllocatedCounts: recompute every counter from the ground-truth
 *     allocation rows (repair + self-heal after a period edit).
 *
 * Callers (student self-select, admin manual/bulk management) pass resolved
 * student identity; this service does not resolve roll numbers or check
 * eligibility — that stays in the calling app service.
 */

import mongoose from "mongoose"
import { DiningAllocation, DiningPeriod } from "../../models/index.js"

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value))

// Optimistic compare-and-set retries: seat contention is rare, a few attempts
// is plenty before we report contention back to the caller.
const MAX_RESERVE_ATTEMPTS = 5

/**
 * Build an allocation owner bound to a Period + Allocation model pair.
 * Production uses the live dining models; the HTTP simulator binds the
 * sim_* collections. Pass `atomicCapacityInc: true` (sim only) to reserve
 * with a conditional $inc instead of the exact-count CAS loop.
 */
export const createAllocationOwner = ({ DiningPeriod, DiningAllocation, atomicCapacityInc = false }) => {

const findCapacityEntry = (period, catererId) =>
  (period?.catererCapacities || []).find((item) => String(item.catererId) === String(catererId))

const missFromPeriod = (period, catererId) => {
  if (!period) return { ok: false, reason: "period-not-found" }
  const entry = findCapacityEntry(period, catererId)
  if (!entry) return { ok: false, reason: "caterer-not-in-period" }
  const allocatedCount = Number(entry.allocatedCount || 0)
  const maxStudentCount = Number(entry.maxStudentCount || 0)
  if (allocatedCount >= maxStudentCount) {
    return { ok: false, reason: "full", allocatedCount, maxStudentCount }
  }
  return null
}

const forceReserveSeat = async ({ periodId, catererId, session }) => {
  const catererObjectId = toObjectId(catererId)
  const res = await DiningPeriod.updateOne(
    { _id: periodId, "catererCapacities.catererId": catererObjectId },
    { $inc: { "catererCapacities.$.allocatedCount": 1 } },
    { session }
  )
  if (res.matchedCount === 0) return { ok: false, reason: "caterer-not-in-period" }
  return { ok: true }
}

/**
 * Single-write reserve: increment only when allocatedCount < maxStudentCount
 * on that array element. No exact-count retry loop. Failure reads the period
 * once to classify full vs missing caterer vs missing period.
 */
const reserveSeatAtomic = async ({ periodId, catererId, force = false, session }) => {
  if (force) return forceReserveSeat({ periodId, catererId, session })

  const catererObjectId = toObjectId(catererId)
  const catererIdStr = String(catererObjectId)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const res = await DiningPeriod.updateOne(
      {
        _id: periodId,
        catererCapacities: { $elemMatch: { catererId: catererObjectId } },
        $expr: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: "$catererCapacities",
                  as: "c",
                  cond: {
                    $and: [
                      { $eq: [{ $toString: "$$c.catererId" }, catererIdStr] },
                      { $lt: ["$$c.allocatedCount", "$$c.maxStudentCount"] },
                    ],
                  },
                },
              },
            },
            0,
          ],
        },
      },
      { $inc: { "catererCapacities.$.allocatedCount": 1 } },
      { session }
    )
    if (Number(res.modifiedCount) === 1) return { ok: true }

    const period = await DiningPeriod.findById(periodId).select("catererCapacities").session(session).lean()
    const miss = missFromPeriod(period, catererId)
    if (miss) return miss
  }

  return { ok: false, reason: "contention" }
}

/**
 * Reserve one seat on a caterer within a period.
 * `force` bypasses the capacity guard (admin override) but still requires the
 * caterer to belong to the period. Returns { ok } or { ok:false, reason }.
 * reasons: period-not-found | caterer-not-in-period | full | contention
 */
const reserveSeatCas = async ({ periodId, catererId, force = false, session }) => {
  const catererObjectId = toObjectId(catererId)

  if (force) return forceReserveSeat({ periodId, catererId, session })

  for (let attempt = 0; attempt < MAX_RESERVE_ATTEMPTS; attempt += 1) {
    const period = await DiningPeriod.findById(periodId).select("catererCapacities").session(session).lean()
    const miss = missFromPeriod(period, catererId)
    if (miss) return miss

    const allocatedCount = Number(findCapacityEntry(period, catererId).allocatedCount || 0)

    // Guard on the exact allocatedCount we read: if another writer moved it in
    // between, modifiedCount is 0 and we re-read and retry.
    const res = await DiningPeriod.updateOne(
      { _id: periodId, catererCapacities: { $elemMatch: { catererId: catererObjectId, allocatedCount } } },
      { $inc: { "catererCapacities.$.allocatedCount": 1 } },
      { session }
    )
    if (Number(res.modifiedCount) === 1) return { ok: true }
  }

  return { ok: false, reason: "contention" }
}

const reserveSeat = atomicCapacityInc ? reserveSeatAtomic : reserveSeatCas

/** Release one seat on a caterer (guarded so allocatedCount never goes below 0). */
const releaseSeat = async ({ periodId, catererId, session }) => {
  await DiningPeriod.updateOne(
    {
      _id: periodId,
      catererCapacities: { $elemMatch: { catererId: toObjectId(catererId), allocatedCount: { $gt: 0 } } },
    },
    { $inc: { "catererCapacities.$.allocatedCount": -1 } },
    { session }
  )
}

const assignStudentOnce = async ({ periodId, studentUserId, studentProfileId, rollNumber, catererId, force }) => {
  const session = await mongoose.startSession()
  let result = null
  try {
    // withTransaction auto-retries transient (write-conflict) errors.
    await session.withTransaction(async () => {
      const existing = await DiningAllocation.findOne({ periodId, studentUserId }).session(session)

      if (existing && String(existing.catererId) === String(catererId)) {
        result = { ok: true, status: "unchanged", allocation: existing.toObject() }
        return
      }

      const reserve = await reserveSeat({ periodId, catererId, force, session })
      if (!reserve.ok) {
        result = { ok: false, reason: reserve.reason, allocatedCount: reserve.allocatedCount, maxStudentCount: reserve.maxStudentCount }
        return
      }

      if (existing) {
        const previousCatererId = existing.catererId
        existing.catererId = toObjectId(catererId)
        existing.selectedAt = new Date()
        const saved = await existing.save({ session })
        await releaseSeat({ periodId, catererId: previousCatererId, session })
        result = { ok: true, status: "moved", previousCatererId: String(previousCatererId), allocation: saved.toObject() }
        return
      }

      const created = await DiningAllocation.create(
        [{ periodId, studentUserId, studentProfileId, rollNumber, catererId, selectedAt: new Date() }],
        { session }
      )
      result = { ok: true, status: "assigned", allocation: created[0].toObject() }
    })
  } finally {
    await session.endSession()
  }
  return result || { ok: false, reason: "unknown" }
}

return {
  /**
   * Assign (or move) a student to a caterer for a period. Idempotent when the
   * student is already on that caterer. Race-safe: the allocation row and the
   * caterer seat counter change together in one transaction, and the seat is
   * capacity-guarded unless `force` is passed.
   * Returns { ok:true, status:'assigned'|'moved'|'unchanged', allocation } or
   * { ok:false, reason } (reasons: full | caterer-not-in-period | period-not-found | contention).
   */
  async assignStudent(args) {
    // A concurrent first-time create for the same (periodId, studentUserId)
    // loses the unique index race with a non-transient 11000; retry once and
    // the loser becomes a move on the now-existing row.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await assignStudentOnce(args)
      } catch (err) {
        if (err?.code === 11000 && attempt === 0) continue
        throw err
      }
    }
    return { ok: false, reason: "conflict" }
  },

  /**
   * Remove a student's allocation for a period and release its seat.
   * Returns { ok:true, removedCatererId, allocation } or { ok:false, reason:'not-found' }.
   */
  async removeStudent({ periodId, studentUserId }) {
    const session = await mongoose.startSession()
    let result = null
    try {
      await session.withTransaction(async () => {
        const existing = await DiningAllocation.findOne({ periodId, studentUserId }).session(session)
        if (!existing) {
          result = { ok: false, reason: "not-found" }
          return
        }
        await DiningAllocation.deleteOne({ _id: existing._id }, { session })
        await releaseSeat({ periodId, catererId: existing.catererId, session })
        result = { ok: true, removedCatererId: String(existing.catererId), allocation: existing.toObject() }
      })
    } finally {
      await session.endSession()
    }
    return result || { ok: false, reason: "unknown" }
  },

  /**
   * Recompute every caterer's allocatedCount from the ground-truth allocation
   * rows for a period. Fixes any drift and is safe to call after a period edit
   * that rewrote catererCapacities. Returns { ok, changed, caterers }.
   */
  async reconcileAllocatedCounts(periodId) {
    const session = await mongoose.startSession()
    let summary = null
    try {
      await session.withTransaction(async () => {
        const period = await DiningPeriod.findById(periodId).select("catererCapacities").session(session)
        if (!period) {
          summary = { ok: false, reason: "period-not-found" }
          return
        }

        const counts = await DiningAllocation.aggregate([
          { $match: { periodId: toObjectId(periodId) } },
          { $group: { _id: "$catererId", count: { $sum: 1 } } },
        ]).session(session)
        const countByCaterer = new Map(counts.map((row) => [String(row._id), row.count]))

        let changed = 0
        period.catererCapacities.forEach((entry) => {
          const actual = countByCaterer.get(String(entry.catererId)) || 0
          if (Number(entry.allocatedCount || 0) !== actual) changed += 1
          entry.allocatedCount = actual
        })
        await period.save({ session })
        summary = { ok: true, changed, caterers: period.catererCapacities.length }
      })
    } finally {
      await session.endSession()
    }
    return summary || { ok: false, reason: "unknown" }
  },
  }
}

export const allocationOwner = createAllocationOwner({ DiningPeriod, DiningAllocation })

export default allocationOwner
