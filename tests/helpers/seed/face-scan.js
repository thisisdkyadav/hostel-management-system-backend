/**
 * Domain fixtures for the face-scanner integration tests.
 *
 * Thin wrappers over seed.js + seed/operations.js. The only extra behaviour
 * vs operations.createAllocation is keeping StudentProfile.currentRoomAllocation
 * in sync (the app maintains that link through the room owner; seeding mirrors
 * the end state — same approach as helpers/seed/students.js).
 */
import { seed } from "../seed.js"
import { createHostel, createUnit, createRoom, createStudentProfile, createAllocation } from "./operations.js"

const models = async () => import("../../../src/models/index.js")

/**
 * Create a student (user + profile) with an active room allocation and the
 * profile's currentRoomAllocation link set.
 */
export async function allocateStudent({ rollNumber, hostelId, roomId, unitId = undefined, bedNumber = 1 } = {}) {
  const { StudentProfile } = await models()

  // Auto-create a hostel/unit/room bundle when the caller doesn't pin one.
  let ids = { hostelId, roomId, unitId }
  if (!hostelId || !roomId) {
    const bundle = await createHostelWithRoom()
    ids = {
      hostelId: hostelId ?? bundle.hostel._id,
      roomId: roomId ?? bundle.room._id,
      unitId: unitId ?? bundle.unit._id,
    }
  }

  const user = await seed.student()
  const profile = await createStudentProfile({ userId: user._id, rollNumber })
  const allocation = await createAllocation({
    userId: user._id,
    studentProfileId: profile._id,
    ...ids,
    bedNumber,
  })
  await StudentProfile.updateOne({ _id: profile._id }, { $set: { currentRoomAllocation: allocation._id } })
  return { user, profile, allocation }
}

/** Create a student (user + profile) WITHOUT any room allocation. */
export async function unallocatedStudent({ rollNumber } = {}) {
  const user = await seed.student()
  const profile = await createStudentProfile({ userId: user._id, rollNumber })
  return { user, profile }
}

/** Hostel + unit + room bundle for gate scanners. */
export async function createHostelWithRoom({ hostelName } = {}) {
  const hostel = await createHostel({ name: hostelName })
  const unit = await createUnit({ hostelId: hostel._id })
  const room = await createRoom({ hostelId: hostel._id, unitId: unit._id })
  return { hostel, unit, room }
}

export default {
  allocateStudent,
  unallocatedStudent,
  createHostelWithRoom,
}
