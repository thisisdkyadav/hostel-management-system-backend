/**
 * Dining Allocation Admin Service
 * -------------------------------
 * Admin-facing management of the caterer-wise student lists for a dining
 * period: view students grouped by caterer, assign/move a single student,
 * bulk-assign a roll-number list to one caterer, remove a student, and
 * reconcile the seat counters.
 *
 * All writes delegate to the allocation owner (services/dining/allocationOwner)
 * so the DiningAllocation rows and the per-caterer allocatedCount counter stay
 * atomic and capacity-guarded. This service only resolves student identity
 * (roll number -> profile), validates the caterer belongs to the period, and
 * shapes the response.
 */

import mongoose from "mongoose"
import { success, badRequest, notFound } from "../../../../services/base/index.js"
import { DiningPeriod } from "../../../../models/index.js"
import { studentProfileQueries } from "../../../../services/student/studentProfileQueries.service.js"
import { MAX_BULK_RECORDS } from "../../../../core/constants/system-limits.constants.js"
import { allocationOwner } from "../../../../services/dining/allocationOwner.service.js"
import { allocationQueries } from "../../../../services/dining/allocationQueries.service.js"

const normalizeRollNumber = (value = "") => String(value || "").trim().toUpperCase()

const normalizeRollNumbers = (values = []) => [
  ...new Set((Array.isArray(values) ? values : []).map(normalizeRollNumber).filter(Boolean)),
]

// Owner failure reason -> human message for a single assignment attempt.
const reasonMessage = (result, catererLabel = "the selected caterer") => {
  switch (result.reason) {
    case "full":
      return `${catererLabel} is full (${result.allocatedCount}/${result.maxStudentCount}). Enable "force" to exceed its capacity.`
    case "caterer-not-in-period":
      return "That caterer is not part of this dining period."
    case "period-not-found":
      return "Dining period not found."
    case "contention":
      return "Seat availability changed while assigning. Please try again."
    case "not-found":
      return "This student is not allocated in this period."
    default:
      return "Unable to update the allocation. Please try again."
  }
}

const getCatererLabelMap = (period) => {
  const map = new Map()
  ;(Array.isArray(period.catererIds) ? period.catererIds : []).forEach((caterer) => {
    if (caterer && typeof caterer === "object" && caterer.name) {
      map.set(String(caterer._id || caterer.id), caterer.name)
    }
  })
  return map
}

const serializeStudentRow = (allocation) => {
  const profile = allocation.studentProfileId && typeof allocation.studentProfileId === "object"
    ? allocation.studentProfileId
    : null
  const user = profile?.userId && typeof profile.userId === "object" ? profile.userId : null
  return {
    allocationId: String(allocation._id),
    studentUserId: String(allocation.studentUserId),
    studentProfileId: profile ? String(profile._id) : String(allocation.studentProfileId || ""),
    rollNumber: allocation.rollNumber,
    name: user?.name || null,
    email: user?.email || null,
    department: profile?.department || null,
    degree: profile?.degree || null,
    batch: profile?.batch || null,
    selectedAt: allocation.selectedAt,
  }
}

const loadPeriodWithCaterers = (periodId) =>
  DiningPeriod.findById(periodId).populate({ path: "catererIds", select: "name email" }).lean()

const catererIdSet = (period) =>
  new Set(
    (Array.isArray(period.catererCapacities) ? period.catererCapacities : [])
      .map((entry) => String(entry.catererId?._id || entry.catererId || ""))
      .filter(Boolean)
  )

class DiningAllocationService {
  /** Caterer-wise student lists for a period, with live (actual) seat counts. */
  async getPeriodAllocations(periodId) {
    if (!mongoose.Types.ObjectId.isValid(periodId)) return badRequest("Invalid dining period")

    const period = await loadPeriodWithCaterers(periodId)
    if (!period) return notFound("Dining period")

    const allocations = await allocationQueries.findAllocationsByPeriod(periodId, { populateStudent: true })
    const catererLabels = getCatererLabelMap(period)

    const rowsByCaterer = new Map()
    allocations.forEach((allocation) => {
      const catererId = String(allocation.catererId)
      if (!rowsByCaterer.has(catererId)) rowsByCaterer.set(catererId, [])
      rowsByCaterer.get(catererId).push(serializeStudentRow(allocation))
    })
    rowsByCaterer.forEach((rows) => rows.sort((a, b) => (a.rollNumber || "").localeCompare(b.rollNumber || "")))

    const caterers = (Array.isArray(period.catererCapacities) ? period.catererCapacities : []).map((entry) => {
      const catererId = String(entry.catererId?._id || entry.catererId || "")
      const students = rowsByCaterer.get(catererId) || []
      const maxStudentCount = Number(entry.maxStudentCount || 0)
      const storedCount = Number(entry.allocatedCount || 0)
      const actualCount = students.length
      return {
        catererId,
        name: catererLabels.get(catererId) || "Unknown caterer",
        maxStudentCount,
        allocatedCount: storedCount,
        actualCount,
        // Surfaces counter drift so the UI can offer a one-click reconcile.
        countDrift: storedCount !== actualCount,
        remainingSeats: Math.max(maxStudentCount - actualCount, 0),
        isFull: actualCount >= maxStudentCount,
        students,
      }
    })

    const totalAssigned = allocations.length
    const totalCapacity = caterers.reduce((sum, entry) => sum + entry.maxStudentCount, 0)

    return success({
      periodId: String(period._id),
      registrationEnabled: period.registrationEnabled !== false,
      startDate: period.startDate,
      endDate: period.endDate,
      eligibilityMode: period.eligibilityMode,
      eligibleStudentCount: Number(period.eligibleStudentCount || 0),
      totalCapacity,
      totalAssigned,
      hasDrift: caterers.some((entry) => entry.countDrift),
      caterers,
    })
  }

  /** Resolve a caterer target + student identity and assign/move one student. */
  async assignStudent(periodId, payload = {}) {
    if (!mongoose.Types.ObjectId.isValid(periodId)) return badRequest("Invalid dining period")

    const catererId = String(payload.catererId || "").trim()
    if (!mongoose.Types.ObjectId.isValid(catererId)) return badRequest("Please select a valid caterer")

    const period = await loadPeriodWithCaterers(periodId)
    if (!period) return notFound("Dining period")
    if (!catererIdSet(period).has(catererId)) return badRequest("That caterer is not part of this dining period")

    const student = await this.resolveStudent(payload)
    if (student.error) return badRequest(student.error)

    const result = await allocationOwner.assignStudent({
      periodId,
      studentUserId: student.userId,
      studentProfileId: student.profileId,
      rollNumber: student.rollNumber,
      catererId,
      force: Boolean(payload.force),
    })

    if (!result.ok) {
      const label = getCatererLabelMap(period).get(catererId) || "The selected caterer"
      return badRequest(reasonMessage(result, label))
    }

    const messageByStatus = {
      assigned: `Assigned ${student.rollNumber} successfully`,
      moved: `Moved ${student.rollNumber} successfully`,
      unchanged: `${student.rollNumber} is already on this caterer`,
    }
    return success({ status: result.status, rollNumber: student.rollNumber }, 200, messageByStatus[result.status])
  }

  /** Assign a roll-number list to one caterer; reports a per-row breakdown. */
  async bulkAssign(periodId, payload = {}) {
    if (!mongoose.Types.ObjectId.isValid(periodId)) return badRequest("Invalid dining period")

    const catererId = String(payload.catererId || "").trim()
    if (!mongoose.Types.ObjectId.isValid(catererId)) return badRequest("Please select a valid caterer")

    const rollNumbers = normalizeRollNumbers(payload.rollNumbers)
    if (rollNumbers.length === 0) return badRequest("Please provide at least one roll number")
    if (rollNumbers.length > MAX_BULK_RECORDS) {
      return badRequest(`Maximum ${MAX_BULK_RECORDS} roll numbers are allowed per request`)
    }

    const period = await loadPeriodWithCaterers(periodId)
    if (!period) return notFound("Dining period")
    if (!catererIdSet(period).has(catererId)) return badRequest("That caterer is not part of this dining period")

    const force = Boolean(payload.force)
    const catererLabel = getCatererLabelMap(period).get(catererId) || "the selected caterer"

    const profiles = await studentProfileQueries.findByRollNumbers(rollNumbers, { select: "_id userId rollNumber status", lean: true })
    const profileByRoll = new Map(profiles.map((profile) => [normalizeRollNumber(profile.rollNumber), profile]))

    const summary = { assigned: 0, moved: 0, unchanged: 0, failed: 0 }
    const failures = []

    // Sequential so the capacity guard sees each prior assignment (a parallel
    // fan-out would let more than `remaining` seats slip past the max).
    for (const rollNumber of rollNumbers) {
      const profile = profileByRoll.get(rollNumber)
      if (!profile) {
        summary.failed += 1
        failures.push({ rollNumber, reason: "No student found with this roll number" })
        continue
      }

      const result = await allocationOwner.assignStudent({
        periodId,
        studentUserId: profile.userId,
        studentProfileId: profile._id,
        rollNumber: normalizeRollNumber(profile.rollNumber),
        catererId,
        force,
      })

      if (result.ok) {
        summary[result.status] += 1
      } else {
        summary.failed += 1
        failures.push({ rollNumber, reason: reasonMessage(result, catererLabel) })
      }
    }

    const changed = summary.assigned + summary.moved
    const message = summary.failed > 0
      ? `Assigned ${changed}, ${summary.unchanged} unchanged, ${summary.failed} failed`
      : `Assigned ${changed} student${changed === 1 ? "" : "s"} to ${catererLabel}`

    return success({ summary, failures }, 200, message)
  }

  /** Remove one student's allocation from the period. */
  async removeStudent(periodId, studentUserId) {
    if (!mongoose.Types.ObjectId.isValid(periodId)) return badRequest("Invalid dining period")
    if (!mongoose.Types.ObjectId.isValid(String(studentUserId))) return badRequest("Invalid student")

    const result = await allocationOwner.removeStudent({ periodId, studentUserId })
    if (!result.ok) {
      if (result.reason === "not-found") return notFound("Student allocation")
      return badRequest(reasonMessage(result))
    }
    return success({ removed: true }, 200, "Student removed from the period")
  }

  /** Recompute the per-caterer seat counters from the actual allocation rows. */
  async reconcile(periodId) {
    if (!mongoose.Types.ObjectId.isValid(periodId)) return badRequest("Invalid dining period")

    const result = await allocationOwner.reconcileAllocatedCounts(periodId)
    if (!result.ok) return notFound("Dining period")

    return success(
      { changed: result.changed, caterers: result.caterers },
      200,
      result.changed > 0 ? `Corrected ${result.changed} caterer seat count(s)` : "Seat counts already correct"
    )
  }

  /** Resolve student identity from an explicit userId or a roll number. */
  async resolveStudent(payload = {}) {
    let profile = null
    if (payload.studentUserId && mongoose.Types.ObjectId.isValid(String(payload.studentUserId))) {
      profile = await studentProfileQueries.findByUserId(payload.studentUserId, { select: "_id userId rollNumber status", lean: true })
    } else if (payload.rollNumber) {
      profile = await studentProfileQueries.findByRollNumber(normalizeRollNumber(payload.rollNumber), { select: "_id userId rollNumber status", lean: true })
    } else {
      return { error: "Please provide a roll number or student" }
    }

    if (!profile) return { error: "No student found for the given roll number" }
    return {
      userId: profile.userId,
      profileId: profile._id,
      rollNumber: normalizeRollNumber(profile.rollNumber),
      status: profile.status,
    }
  }
}

export const diningAllocationService = new DiningAllocationService()
export default diningAllocationService
