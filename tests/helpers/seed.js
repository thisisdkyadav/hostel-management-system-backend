/**
 * Seed helpers — create users (and later domain fixtures) from zero.
 *
 * Every helper creates real documents in the test database via the backend's
 * own models, so tests exercise the same validation and defaults as prod.
 * Extend this file (or add helpers/seed/<domain>.js) with domain fixtures as
 * test suites need them.
 */
import { ROLES } from "../../src/core/constants/roles.constants.js"

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export const seed = {
  /**
   * Create a User with any role/subrole.
   * @returns {Promise<mongoose.Document>} the saved User document
   */
  async createUser({ role = ROLES.STUDENT, subRole = null, email, name, ...extra } = {}) {
    const { default: User } = await import("../../src/models/user/User.model.js")
    const n = unique()
    const doc = await User.create({
      name: name ?? `Test ${role} ${n}`,
      email: email ?? `test-${role.toLowerCase().replace(/\s+/g, "-")}-${n}@hms.test`,
      role,
      subRole,
      ...extra,
    })
    return doc
  },

  student: (extra = {}) => seed.createUser({ role: ROLES.STUDENT, ...extra }),
  warden: (extra = {}) => seed.createUser({ role: ROLES.WARDEN, ...extra }),
  associateWarden: (extra = {}) => seed.createUser({ role: ROLES.ASSOCIATE_WARDEN, ...extra }),
  admin: (extra = {}) => seed.createUser({ role: ROLES.ADMIN, ...extra }),
  superAdmin: (extra = {}) => seed.createUser({ role: ROLES.SUPER_ADMIN, ...extra }),
  security: (extra = {}) => seed.createUser({ role: ROLES.SECURITY, ...extra }),
  hostelSupervisor: (extra = {}) => seed.createUser({ role: ROLES.HOSTEL_SUPERVISOR, ...extra }),
  maintenanceStaff: (extra = {}) => seed.createUser({ role: ROLES.MAINTENANCE_STAFF, ...extra }),
}

export default seed
