/**
 * Complaint-domain fixtures: hostels, units, rooms, student profiles,
 * room allocations, complaints, and feedback action-link tokens.
 *
 * Everything is created through the backend's own models/services so tests
 * exercise the same validation and defaults as prod.
 */
let counter = 0
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`

export const createHostel = async ({ name, type = "room-only", gender = "Boys" } = {}) => {
  const { default: Hostel } = await import("../../../src/models/hostel/Hostel.model.js")
  return Hostel.create({ name: name ?? `Test Hostel ${unique()}`, type, gender })
}

export const createUnit = async ({ hostelId, unitNumber } = {}) => {
  const { default: Unit } = await import("../../../src/models/hostel/Unit.model.js")
  return Unit.create({ hostelId, unitNumber: unitNumber ?? `U${unique()}` })
}

export const createRoom = async ({ hostelId, unitId = null, roomNumber, capacity = 2 } = {}) => {
  const { default: Room } = await import("../../../src/models/hostel/Room.model.js")
  return Room.create({
    hostelId,
    unitId,
    roomNumber: roomNumber ?? `R${unique()}`,
    capacity,
  })
}

export const createStudentProfile = async ({ userId, rollNumber } = {}) => {
  const { default: StudentProfile } = await import(
    "../../../src/models/student/StudentProfile.model.js"
  )
  return StudentProfile.create({ userId, rollNumber: rollNumber ?? `ROLL${unique()}`.toUpperCase() })
}

export const createAllocation = async ({
  userId,
  studentProfileId,
  hostelId,
  roomId,
  unitId = null,
  bedNumber = 1,
}) => {
  const { default: RoomAllocation } = await import(
    "../../../src/models/hostel/RoomAllocation.model.js"
  )
  return RoomAllocation.create({
    userId,
    studentProfileId,
    hostelId,
    roomId,
    unitId,
    bedNumber,
  })
}

/**
 * Student user + profile + hostel/unit/room + allocation, wired together.
 * @returns {Promise<{user, profile, hostel, unit, room, allocation}>}
 */
export const studentWithRoom = async (seed, { hostel, unit, roomNumber, bedNumber = 1 } = {}) => {
  const user = await seed.student()
  const profile = await createStudentProfile({ userId: user._id })
  const finalHostel = hostel ?? (await createHostel())
  const finalUnit = unit ?? (await createUnit({ hostelId: finalHostel._id }))
  const room = await createRoom({ hostelId: finalHostel._id, unitId: finalUnit._id, roomNumber })
  const allocation = await createAllocation({
    userId: user._id,
    studentProfileId: profile._id,
    hostelId: finalHostel._id,
    roomId: room._id,
    unitId: finalUnit._id,
    bedNumber,
  })
  return { user, profile, hostel: finalHostel, unit: finalUnit, room, allocation }
}

export const createComplaint = async ({
  userId,
  title,
  description = "Something is broken",
  status = "Pending",
  category = "Other",
  location = "",
  hostelId = null,
  unitId = null,
  roomId = null,
  attachments = [],
  resolutionNotes = null,
  resolutionDate = null,
  resolvedBy = null,
  feedback = null,
  feedbackRating = null,
  satisfactionStatus = null,
} = {}) => {
  const { default: Complaint } = await import("../../../src/models/complaint/Complaint.model.js")
  return Complaint.create({
    userId,
    title: title ?? `Test complaint ${unique()}`,
    description,
    status,
    category,
    location,
    hostelId,
    unitId,
    roomId,
    attachments,
    resolutionNotes,
    resolutionDate,
    resolvedBy,
    feedback,
    feedbackRating,
    satisfactionStatus,
  })
}

/**
 * Complaint-feedback action-link token (the kind emailed on resolution).
 * @returns {Promise<string>} the raw token usable in /complaint/feedback/:token
 */
export const createFeedbackToken = async ({
  complaintId,
  recipientUserId = null,
  recipientEmail = "student@hms.test",
  expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  used = false,
} = {}) => {
  const {
    ACTION_LINK_TOKEN_TYPE,
    createActionLinkToken,
    consumeActionLinkToken,
  } = await import("../../../src/services/action-links/action-link-token.service.js")
  const { rawToken, tokenDoc } = await createActionLinkToken({
    type: ACTION_LINK_TOKEN_TYPE.COMPLAINT_FEEDBACK,
    subjectModel: "Complaint",
    subjectId: complaintId,
    recipientUserId,
    recipientEmail,
    expiresAt,
  })
  if (used) await consumeActionLinkToken(tokenDoc, {})
  return rawToken
}

/** Legacy FeedbackToken (pre-action-link format). Returns the raw token string. */
export const createLegacyFeedbackToken = async ({
  complaintId,
  expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  used = false,
} = {}) => {
  const { default: FeedbackToken } = await import(
    "../../../src/models/complaint/FeedbackToken.model.js"
  )
  const doc = await FeedbackToken.create({ complaintId, expiresAt, used })
  return doc.token
}

export default {
  createHostel,
  createUnit,
  createRoom,
  createStudentProfile,
  createAllocation,
  studentWithRoom,
  createComplaint,
  createFeedbackToken,
  createLegacyFeedbackToken,
}
