/**
 * Campus-life domain fixtures — hostels, room allocations, student profiles.
 *
 * Created via the backend's own models so validation and defaults match prod.
 * Used by tests/apps/campus-life/*.test.js
 */
import mongoose from "mongoose"

let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export const campusSeed = {
  /** Create a Hostel. */
  async createHostel({ name, type = "room-only", gender = "Boys" } = {}) {
    const { default: Hostel } = await import("../../../src/models/hostel/Hostel.model.js")
    return Hostel.create({
      name: name ?? `Test Hostel ${unique()}`,
      type,
      gender,
    })
  },

  /**
   * Create a StudentProfile for an existing user, optionally linked to a hostel
   * through a RoomAllocation (feedback/events/notifications scoping need it).
   * @returns {{ profile, allocation|null }}
   */
  async createStudentProfile({
    user,
    rollNumber,
    gender = "Male",
    degree = "B.Tech",
    department = "CSE",
    hostel = null,
  } = {}) {
    const { default: StudentProfile } = await import(
      "../../../src/models/student/StudentProfile.model.js"
    )
    const { default: RoomAllocation } = await import(
      "../../../src/models/hostel/RoomAllocation.model.js"
    )

    let allocation = null
    if (hostel) {
      allocation = await RoomAllocation.create({
        userId: user._id,
        // RoomAllocation.studentProfileId is required; the profile doc does not
        // exist yet, so link it right after creation below.
        studentProfileId: new mongoose.Types.ObjectId(),
        hostelId: hostel._id,
        roomId: new mongoose.Types.ObjectId(),
        bedNumber: 1,
      })
    }

    const profile = await StudentProfile.create({
      userId: user._id,
      rollNumber: rollNumber ?? `RN${unique()}`.toUpperCase(),
      gender,
      degree,
      department,
      currentRoomAllocation: allocation?._id ?? undefined,
    })

    if (allocation) {
      allocation.studentProfileId = profile._id
      await allocation.save()
    }

    return { profile, allocation }
  },

  /** Convenience: create a Student user + profile in one call. */
  async studentWithProfile(opts = {}) {
    const { seed } = await import("../seed.js")
    const user = await seed.student({ ...opts.user })
    const { profile, allocation } = await this.createStudentProfile({ user, ...opts.profile })
    return { user, profile, allocation }
  },
}

export default campusSeed
