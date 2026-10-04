// Fixtures only: the API never accepts proof refs uploaded for another request.
export async function registerH4Proof(requestId, ref) {
  const { AccommodationRequest } = await import("../../../src/models/index.js")
  await AccommodationRequest.updateOne({ _id: requestId }, { $addToSet: { "h4.proofRefs": ref } })
}

export async function readH4Notification(requestId) {
  const { AccommodationNotification } = await import("../../../src/models/index.js")
  return AccommodationNotification.findOne({ requestId }).lean()
}

export async function seedH2RoomBooking({ userId, hostelId, roomId, fromDate, toDate }) {
  const { AccommodationRequest } = await import("../../../src/models/index.js")
  return AccommodationRequest.create({
    typeKey: "visitor",
    requesterUserId: userId,
    applicantName: "Normal guest requester",
    applicantEmail: "requester@iiti.ac.in",
    guests: [{ name: "Normal guest", gender: "Male" }],
    persons: 1,
    status: "Rooms Assigned",
    stay: { fromDate, toDate },
    allotment: { hostelId },
    guestAllotments: [{ guestIndex: 0, hostelId }],
    rooms: [{ roomId, guestIndexes: [0] }],
  })
}

export async function seedLegacyBookingRequest({ userId, hostelId, fromDate, toDate }) {
  const { VisitorProfile, VisitorRequest } = await import("../../../src/models/index.js")
  const profile = await VisitorProfile.create({
    studentUserId: userId,
    name: "Legacy guest",
    email: "legacy-guest@example.com",
    phone: "9876543210",
    relation: "Father",
  })
  return VisitorRequest.create({
    userId,
    hostelId,
    visitors: [profile._id],
    reason: "Legacy booking fixture",
    fromDate,
    toDate,
    status: "Approved",
  })
}
