/**
 * Domain fixtures for the administration super-admin + warden module tests.
 *
 * Creates real Hostel documents and warden-family staff profiles (User +
 * StaffRoles doc) using the backend's own models, mirroring what the
 * warden-management flows would produce.
 */
import { seed } from "../seed.js"

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

/** Create a Hostel with a unique name. */
export async function seedHostel(extra = {}) {
  const { default: Hostel } = await import("../../../src/models/hostel/Hostel.model.js")
  const n = unique()
  return Hostel.create({
    name: extra.name ?? `Test Hostel ${n}`,
    type: extra.type ?? "room-only",
    gender: extra.gender ?? "Boys",
    ...extra,
  })
}

/**
 * Create a User with a warden-family role plus its StaffRoles profile.
 * @param {"Warden"|"AssociateWarden"|"HostelSupervisor"} modelKey
 */
async function seedStaffProfile(modelKey, roleName, { hostels = [], activeHostel = null, ...userExtra } = {}) {
  const { default: Model } = await import(`../../../src/models/user/${modelKey}.model.js`)
  const user = await seed.createUser({ role: roleName, ...userExtra })
  const hostelIds = hostels.map((h) => h._id ?? h)
  const profile = await Model.create({
    userId: user._id,
    hostelIds,
    activeHostelId: activeHostel ? (activeHostel._id ?? activeHostel) : null,
    status: hostelIds.length > 0 ? "assigned" : "unassigned",
  })
  return { user, profile }
}

export const seedWardenProfile = (opts = {}) =>
  seedStaffProfile("Warden", "Warden", opts)

export const seedAssociateWardenProfile = (opts = {}) =>
  seedStaffProfile("AssociateWarden", "Associate Warden", opts)

export const seedHostelSupervisorProfile = (opts = {}) =>
  seedStaffProfile("HostelSupervisor", "Hostel Supervisor", opts)

export default {
  seedHostel,
  seedWardenProfile,
  seedAssociateWardenProfile,
  seedHostelSupervisorProfile,
}
