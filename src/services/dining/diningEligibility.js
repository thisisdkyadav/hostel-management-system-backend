/**
 * Who may take part in a dining period (pure, no model access).
 *
 * - "all-hostellers": every Active student who is not a day scholar;
 * - "all-active": every Active student (day scholars included);
 * - "custom": the Active students on the period's roll list.
 *
 * Shared by student self-select, auto-allocation, the registration email and
 * the period's eligible count, so they never disagree.
 */

export const ELIGIBILITY_MODE_ALL_HOSTELLERS = "all-hostellers"
export const ELIGIBILITY_MODE_ALL_ACTIVE = "all-active"
export const ELIGIBILITY_MODE_CUSTOM = "custom"
export const ELIGIBILITY_MODES = [ELIGIBILITY_MODE_ALL_HOSTELLERS, ELIGIBILITY_MODE_ALL_ACTIVE, ELIGIBILITY_MODE_CUSTOM]

// Profiles predating the flag have no isDayScholar: they are hostellers.
export const HOSTELLER_PROFILE_FILTER = { isDayScholar: { $ne: true } }

/** StudentProfile filter for a period's eligible students, or null for an unknown mode. */
export const eligibleProfileFilter = ({ eligibilityMode, eligibleRollNumbers = [] } = {}) => {
  if (eligibilityMode === ELIGIBILITY_MODE_ALL_HOSTELLERS) return { status: "Active", ...HOSTELLER_PROFILE_FILTER }
  if (eligibilityMode === ELIGIBILITY_MODE_ALL_ACTIVE) return { status: "Active" }
  if (eligibilityMode === ELIGIBILITY_MODE_CUSTOM) return { status: "Active", rollNumber: { $in: eligibleRollNumbers } }
  return null
}

/** Whether one profile ({ status, rollNumber, isDayScholar }) is eligible for the period. */
export const isProfileEligible = (period, profile, normalizeRollNumber = (value) => String(value || "").trim().toUpperCase()) => {
  if (!period || !profile || profile.status !== "Active") return false
  if (period.eligibilityMode === ELIGIBILITY_MODE_ALL_HOSTELLERS) return profile.isDayScholar !== true
  if (period.eligibilityMode === ELIGIBILITY_MODE_ALL_ACTIVE) return true
  if (period.eligibilityMode === ELIGIBILITY_MODE_CUSTOM) {
    return Array.isArray(period.eligibleRollNumbers) && period.eligibleRollNumbers.includes(normalizeRollNumber(profile.rollNumber))
  }
  return false
}

/** DiningPeriod `$or` clauses of the periods a profile is eligible for. */
export const periodEligibilityClauses = (profile = {}, rollNumber = "") => [
  ...(profile?.isDayScholar === true ? [] : [{ eligibilityMode: ELIGIBILITY_MODE_ALL_HOSTELLERS }]),
  { eligibilityMode: ELIGIBILITY_MODE_ALL_ACTIVE },
  { eligibilityMode: ELIGIBILITY_MODE_CUSTOM, eligibleRollNumbers: rollNumber },
]

export default { eligibleProfileFilter, isProfileEligible, periodEligibilityClauses }
