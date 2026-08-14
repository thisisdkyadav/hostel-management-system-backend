/**
 * Hostel scoping for the bulk student tools.
 *
 * Admins are unbound: every helper here is a pass-through for them, so their
 * queries and results are identical to an unscoped run. Hostel-bound staff
 * (Hostel Supervisors, Wardens, Associate Wardens) only ever reach students
 * currently allocated to their active hostel.
 *
 * This fails CLOSED: a hostel-bound user with no active hostel matches nothing,
 * because a bulk write that cannot resolve its own scope must not run system
 * wide. That is deliberately stricter than `getConstraintContext`, which the
 * read paths use.
 *
 * A student's hostel is not a field on StudentProfile — it hangs off
 * `currentRoomAllocation.hostelId` — so scoped reads populate that link. The
 * populate is skipped entirely for unbound callers.
 */

import { ROLES } from "../core/constants/roles.constants.js"
import { studentProfileQueries } from "../services/student/studentProfileQueries.service.js"

const HOSTEL_BOUND_ROLES = new Set([ROLES.WARDEN, ROLES.ASSOCIATE_WARDEN, ROLES.HOSTEL_SUPERVISOR])

const toIdString = (value) => {
  if (!value) return null
  if (typeof value === "string") return value.trim() || null
  return value?.toString?.() ?? null
}

const allocationHostelId = (student) => student?.currentRoomAllocation?.hostelId ?? null

/** The caller's scope: which hostels, if any, bound their reach. */
export const getHostelScope = (user) => {
  const hostelBound = HOSTEL_BOUND_ROLES.has(user?.role)
  const ownHostelId = toIdString(user?.hostel?._id || user?.hostel)

  return {
    hostelBound,
    scopedHostelIds: hostelBound && ownHostelId ? new Set([ownHostelId]) : null,
  }
}

/** True when results must be narrowed (and therefore joined to their hostel). */
export const isHostelScoped = (scope) => Boolean(scope?.hostelBound)

export const isHostelAllowed = (hostelId, scope) => {
  if (!scope?.hostelBound) return true
  if (!scope.scopedHostelIds || !hostelId) return false
  return scope.scopedHostelIds.has(toIdString(hostelId))
}

/**
 * Allocation writes for hostel-bound staff: student must be unallocated, or
 * already in an allowed hostel. Students allocated elsewhere are out of scope.
 */
export const isStudentAllocatableInScope = (currentAllocationHostelId, scope) => {
  if (!scope?.hostelBound) return true
  if (!currentAllocationHostelId) return true
  return isHostelAllowed(currentAllocationHostelId, scope)
}

/** `findByRollNumbers`, narrowed to the caller's hostel when they have one. */
export const findStudentsByRollNumbersInScope = async (rollNumbers, scope, { select, session, lean } = {}) => {
  if (!isHostelScoped(scope)) {
    return studentProfileQueries.findByRollNumbers(rollNumbers, { select, session, lean })
  }

  const students = await studentProfileQueries.findByRollNumbers(rollNumbers, {
    select: select ? `${select} currentRoomAllocation` : select,
    populate: { path: "currentRoomAllocation", select: "hostelId" },
    session,
    lean,
  })

  return students.filter((student) => isHostelAllowed(allocationHostelId(student), scope))
}

/** Profiles matching `filter` that the caller may touch. Scoped callers only. */
export const findProfilesInScope = async (filter, scope, { select, session } = {}) => {
  const profiles = await studentProfileQueries.findAllocationLinksByFilter(filter, { select, session })
  return profiles.filter((profile) => isHostelAllowed(allocationHostelId(profile), scope))
}

/** Ids of the profiles matching `filter` that the caller may touch. */
export const findProfileIdsInScope = async (filter, scope, { session } = {}) => {
  const profiles = await findProfilesInScope(filter, scope, { session })
  return profiles.map((profile) => profile._id)
}

export default {
  getHostelScope,
  isHostelScoped,
  isHostelAllowed,
  isStudentAllocatableInScope,
  findStudentsByRollNumbersInScope,
  findProfilesInScope,
  findProfileIdsInScope,
}
