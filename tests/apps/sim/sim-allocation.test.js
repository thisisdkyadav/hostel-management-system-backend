/**
 * Simulator allocation owner: conditional $inc (atomicCapacityInc) on sim_*
 * collections. Live dining still uses the exact-count CAS path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import mongoose from "mongoose"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { createAllocationOwner } from "../../../src/services/dining/allocationOwner.service.js"
import {
  SimCaterer,
  SimDiningAllocation,
  SimDiningPeriod,
} from "../../../src/apps/sim/sim.models.js"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

const owner = createAllocationOwner({
  DiningPeriod: SimDiningPeriod,
  DiningAllocation: SimDiningAllocation,
  atomicCapacityInc: true,
})

const seedPeriod = async ({ maxStudentCount, allocatedCount = 0, extraCaterer = false }) => {
  const stamp = Date.now().toString(36)
  const caterer = await SimCaterer.create({
    name: `Sim A ${stamp}`,
    email: `sim-a-${stamp}@sim.hms.local`,
  })
  const other = extraCaterer
    ? await SimCaterer.create({
        name: `Sim B ${stamp}`,
        email: `sim-b-${stamp}@sim.hms.local`,
      })
    : null
  const now = Date.now()
  const capacities = [{ catererId: caterer._id, maxStudentCount, allocatedCount }]
  const catererIds = [caterer._id]
  if (other) {
    catererIds.push(other._id)
    capacities.push({ catererId: other._id, maxStudentCount: 50, allocatedCount: 0 })
  }
  const period = await SimDiningPeriod.create({
    startDate: new Date(now - 86400000),
    endDate: new Date(now + 30 * 86400000),
    registrationEnabled: true,
    allocationStartAt: new Date(now - 3600000),
    allocationEndAt: new Date(now + 7 * 86400000),
    catererIds,
    catererCapacities: capacities,
    eligibilityMode: "all-active",
  })
  return { caterer, other, period }
}

const studentArgs = (i) => ({
  studentUserId: new mongoose.Types.ObjectId(),
  studentProfileId: new mongoose.Types.ObjectId(),
  rollNumber: `SIM${String(i).padStart(6, "0")}`,
})

describe("sim allocation owner (atomicCapacityInc)", () => {
  it("assigns a seat and increments allocatedCount", async () => {
    const { caterer, period } = await seedPeriod({ maxStudentCount: 5 })
    const result = await owner.assignStudent({
      periodId: period._id,
      catererId: caterer._id,
      ...studentArgs(1),
    })
    expect(result.ok).toBe(true)
    expect(result.status).toBe("assigned")

    const after = await SimDiningPeriod.findById(period._id).lean()
    expect(after.catererCapacities[0].allocatedCount).toBe(1)
    expect(await SimDiningAllocation.countDocuments({ periodId: period._id })).toBe(1)
  })

  it("is unchanged when the student is already on that caterer", async () => {
    const { caterer, period } = await seedPeriod({ maxStudentCount: 5 })
    const args = { periodId: period._id, catererId: caterer._id, ...studentArgs(2) }
    expect((await owner.assignStudent(args)).status).toBe("assigned")
    const again = await owner.assignStudent(args)
    expect(again.ok).toBe(true)
    expect(again.status).toBe("unchanged")
    const after = await SimDiningPeriod.findById(period._id).lean()
    expect(after.catererCapacities[0].allocatedCount).toBe(1)
  })

  it("moves a student and releases the previous seat", async () => {
    const { caterer, other, period } = await seedPeriod({ maxStudentCount: 5, extraCaterer: true })
    const args = { periodId: period._id, ...studentArgs(3) }
    expect((await owner.assignStudent({ ...args, catererId: caterer._id })).status).toBe("assigned")
    const moved = await owner.assignStudent({ ...args, catererId: other._id })
    expect(moved.ok).toBe(true)
    expect(moved.status).toBe("moved")

    const after = await SimDiningPeriod.findById(period._id).lean()
    const capA = after.catererCapacities.find((e) => String(e.catererId) === String(caterer._id))
    const capB = after.catererCapacities.find((e) => String(e.catererId) === String(other._id))
    expect(capA.allocatedCount).toBe(0)
    expect(capB.allocatedCount).toBe(1)
  })

  it("returns full without overselling", async () => {
    const { caterer, period } = await seedPeriod({ maxStudentCount: 1 })
    const first = await owner.assignStudent({
      periodId: period._id,
      catererId: caterer._id,
      ...studentArgs(4),
    })
    expect(first.status).toBe("assigned")
    const second = await owner.assignStudent({
      periodId: period._id,
      catererId: caterer._id,
      ...studentArgs(5),
    })
    expect(second.ok).toBe(false)
    expect(second.reason).toBe("full")
    expect(await SimDiningAllocation.countDocuments({ periodId: period._id })).toBe(1)
  })

  it("returns caterer-not-in-period for an outsider", async () => {
    const { period } = await seedPeriod({ maxStudentCount: 5 })
    const outsider = new mongoose.Types.ObjectId()
    const result = await owner.assignStudent({
      periodId: period._id,
      catererId: outsider,
      ...studentArgs(6),
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe("caterer-not-in-period")
  })

  it("concurrent first-time assigns never exceed capacity", async () => {
    const seats = 10
    const demand = 25
    const { caterer, period } = await seedPeriod({ maxStudentCount: seats })
    const results = await Promise.all(
      Array.from({ length: demand }, (_, i) =>
        owner.assignStudent({
          periodId: period._id,
          catererId: caterer._id,
          ...studentArgs(100 + i),
        })
      )
    )

    const assigned = results.filter((r) => r.ok && r.status === "assigned")
    const full = results.filter((r) => !r.ok && r.reason === "full")
    expect(assigned.length).toBe(seats)
    expect(full.length).toBe(demand - seats)
    expect(results.every((r) => r.ok || r.reason === "full")).toBe(true)

    const after = await SimDiningPeriod.findById(period._id).lean()
    expect(after.catererCapacities[0].allocatedCount).toBe(seats)
    expect(await SimDiningAllocation.countDocuments({ periodId: period._id })).toBe(seats)
  })
})
