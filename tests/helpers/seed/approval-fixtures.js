/**
 * Approval-chain fixtures for the events/expenditure/grievance/POR suites
 * (student-affairs area). Named distinctly from other seed helpers to avoid
 * collisions between parallel test authors.
 */
import { seed } from "../seed.js"

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export const approvalSeed = {
  /** Admin user with an SA subrole ("Student Affairs", "Officer SA", ...). */
  adminWithSubRole: (subRole, extra = {}) =>
    seed.createUser({ role: "Admin", subRole, ...extra }),

  /** Gymkhana role user with a subrole ("GS Gymkhana", "President Gymkhana", ...). */
  gymkhana: (subRole = null, extra = {}) =>
    seed.createUser({ role: "Gymkhana", subRole, ...extra }),

  /** Student User + StudentProfile pair (unique roll number). */
  async studentWithProfile(extra = {}) {
    const user = await seed.student(extra.user)
    const { default: StudentProfile } = await import(
      "../../../src/models/student/StudentProfile.model.js"
    )
    const profile = await StudentProfile.create({
      userId: user._id,
      rollNumber: extra.rollNumber ?? `APR${unique()}`.toUpperCase(),
      department: "Computer Science",
      degree: "B.Tech",
      batch: "2024",
    })
    return { user, profile }
  },
}

export default approvalSeed
