import { describe, it, expect } from "vitest"
import { eligibleProfileFilter, isProfileEligible, periodEligibilityClauses } from "../../../src/services/dining/diningEligibility.js"

const hosteller = { status: "Active", rollNumber: "H1", isDayScholar: false }
const legacy = { status: "Active", rollNumber: "L1" } // predates the flag: a hosteller
const dayScholar = { status: "Active", rollNumber: "D1", isDayScholar: true }

describe("dining eligibility rule", () => {
  it("all-hostellers excludes day scholars only", () => {
    const period = { eligibilityMode: "all-hostellers" }
    expect(isProfileEligible(period, hosteller)).toBe(true)
    expect(isProfileEligible(period, legacy)).toBe(true)
    expect(isProfileEligible(period, dayScholar)).toBe(false)
    expect(isProfileEligible(period, { ...hosteller, status: "Graduated" })).toBe(false)
    expect(eligibleProfileFilter(period)).toEqual({ status: "Active", isDayScholar: { $ne: true } })
  })

  it("all-active and custom are unchanged", () => {
    expect(isProfileEligible({ eligibilityMode: "all-active" }, dayScholar)).toBe(true)
    const custom = { eligibilityMode: "custom", eligibleRollNumbers: ["D1"] }
    expect(isProfileEligible(custom, dayScholar)).toBe(true)
    expect(isProfileEligible(custom, hosteller)).toBe(false)
    expect(eligibleProfileFilter({ eligibilityMode: "nope" })).toBeNull()
  })

  it("a day scholar's portal never matches all-hostellers periods", () => {
    const modes = (profile) => periodEligibilityClauses(profile, profile.rollNumber).map((c) => c.eligibilityMode)
    expect(modes(dayScholar)).toEqual(["all-active", "custom"])
    expect(modes(hosteller)).toEqual(["all-hostellers", "all-active", "custom"])
  })
})
