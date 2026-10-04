/**
 * Accommodation Queries Service
 * -----------------------------
 * The single READ surface for the AccommodationRequest + AccommodationType
 * collections. Every module that reads accommodation data calls these methods
 * instead of importing the models, so those models are touched only inside
 * `src/services/accommodation/` (writes live in accommodationOwner.service.js).
 *
 * Guest-room occupancy for these bookings is TEMPORAL (date-range), computed
 * from `rooms[]`/`persons` across overlapping requests here — never from
 * Room.occupancy (Room state is owned by the hostel roomOwner). The overlap
 * read (`findOverlappingAllotted`) is the source of truth for availability.
 *
 * Mutation paths load a HYDRATED doc (findRequestById) because the caller
 * mutates workflow fields and saves via accommodationOwner.persist(); read-only
 * paths use the lean variants.
 */

import {
  AccommodationRequest,
  AccommodationType,
  AccommodationReservation,
  ACCOMMODATION_STATUS,
} from "../../models/index.js"

const withSession = (query, session) => (session ? query.session(session) : query)

// Half-open overlap: [aFrom, aTo) intersects [bFrom, bTo) iff aFrom < bTo && bFrom < aTo.
const overlapFilter = (from, to) => ({
  "stay.fromDate": { $lt: new Date(to) },
  "stay.toDate": { $gt: new Date(from) },
})

export const accommodationQueries = {
  async findH4ById(requestId, { session, lean = false } = {}) {
    const q = withSession(AccommodationRequest.findOne({ _id: requestId, typeKey: "intern" }), session)
    return lean ? q.lean() : q
  },
  async listH4(filter, { skip = 0, limit = 25 } = {}) {
    return AccommodationRequest.find({ ...filter, typeKey: "intern" }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean()
  },
  async countH4(filter = {}) { return AccommodationRequest.countDocuments({ ...filter, typeKey: "intern" }) },
  async findReservations({ roomIds, hostelId, from, to, excludeRequestId, session } = {}) {
    const filter = { active: true, from: { $lt: new Date(to) }, to: { $gt: new Date(from) } }
    if (roomIds) filter.roomId = { $in: roomIds }
    if (hostelId) filter.hostelId = hostelId
    if (excludeRequestId) filter.requestId = { $ne: excludeRequestId }
    return withSession(AccommodationReservation.find(filter), session)
      .populate("requestId", "applicantName status stay").lean()
  },
  async findRoomBookings({ roomId, from, to, excludeRequestId, session } = {}) {
    return withSession(AccommodationRequest.find({
      _id: { $ne: excludeRequestId }, typeKey: { $ne: "intern" }, "rooms.roomId": roomId,
      status: { $nin: [ACCOMMODATION_STATUS.REJECTED, ACCOMMODATION_STATUS.CANCELLED, ACCOMMODATION_STATUS.CHECKED_OUT, ACCOMMODATION_STATUS.INVOICED] },
      "stay.fromDate": { $lte: new Date(to) }, "stay.toDate": { $gte: new Date(from) },
    }), session).select("applicantName guests status stay").lean()
  },
  async findH4Ended() {
    return AccommodationRequest.find({ typeKey: "intern", status: { $in: [ACCOMMODATION_STATUS.ROOMS_ASSIGNED, ACCOMMODATION_STATUS.CHECKED_IN] }, "stay.toDate": { $lt: new Date() } }).select("_id").lean()
  },
  async findH4AwaitingInvoice() {
    return AccommodationRequest.find({ typeKey: "intern", status: ACCOMMODATION_STATUS.CHECKED_OUT,
      "payment.status": "Verified", additionalPayments: { $not: { $elemMatch: { status: { $ne: "Verified" } } } } }).select("_id").lean()
  },
  // ==================== AccommodationRequest ====================

  /** Hydrated request by id — for mutate-then-persist workflow paths. */
  async findRequestById(requestId, { session } = {}) {
    return withSession(AccommodationRequest.findOne({ _id: requestId, typeKey: { $ne: "intern" } }), session)
  },

  /** Lean request by id — read-only surfaces. */
  async findRequestByIdLean(requestId) {
    return AccommodationRequest.findOne({ _id: requestId, typeKey: { $ne: "intern" } }).lean()
  },

  /** Count requests matching a filter (list pagination). */
  async countRequests(filter = {}) {
    return AccommodationRequest.countDocuments({ ...filter, typeKey: { $ne: "intern" } })
  },

  /** Paginated lean list, newest first. */
  async listRequests(filter = {}, { skip = 0, limit = 10 } = {}) {
    return AccommodationRequest.find({ ...filter, typeKey: { $ne: "intern" } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
  },

  /**
   * Hydrated requests stuck at Chief-Warden approval past their deadline
   * (auto-approve sweep). Mutated + persisted by the caller in a loop.
   */
  async findPendingCwApprovalDue() {
    return AccommodationRequest.find({
      status: ACCOMMODATION_STATUS.PENDING_CW_APPROVAL,
      typeKey: { $ne: "intern" },
      stageDeadlineAt: { $ne: null, $lte: new Date() },
    })
  },

  /**
   * Hydrated in-stay requests whose stay has ended (nightly close-out sweep).
   * Statuses transition to INVOICED, so a closed request never matches again —
   * no invoice filter is needed. Mutated + persisted by the caller in a loop.
   */
  /** Lean requests whose GST invoice was generated in [from, to] inclusive. */
  async findInvoicedBetween(from, to) {
    return AccommodationRequest.find({
      "invoice.generatedAt": { $gte: new Date(from), $lte: new Date(to) },
      typeKey: { $ne: "intern" },
    })
      .sort({ "invoice.generatedAt": 1 })
      .lean()
  },

  async findDueForStayClose() {
    return AccommodationRequest.find({
      typeKey: { $ne: "intern" },
      status: {
        $in: [
          ACCOMMODATION_STATUS.ROOMS_ASSIGNED,
          ACCOMMODATION_STATUS.CHECKED_IN,
          ACCOMMODATION_STATUS.CHECKED_OUT,
        ],
      },
      "stay.toDate": { $lt: new Date() },
    })
  },

  /**
   * Bookings holding beds in a hostel whose stay overlaps [from, to). Drives
   * guest-room availability: the hostel is now chosen at payment-request time,
   * so a booking claims the empty pool from that moment until its rooms are
   * assigned (after which the rooms leave the Active-empty pool on their own).
   * Returns lean projections; callers count only the guests allotted here
   * (`guestAllotments` or legacy `allotment.hostelId`).
   */
  async findOverlappingAllotted({ hostelId, from, to, excludeRequestId } = {}) {
    const filter = {
      typeKey: { $ne: "intern" },
      $or: [{ "guestAllotments.hostelId": hostelId }, { "allotment.hostelId": hostelId }],
      status: {
        $in: [
          ACCOMMODATION_STATUS.PAYMENT_REQUESTED,
          ACCOMMODATION_STATUS.PAYMENT_SUBMITTED,
          ACCOMMODATION_STATUS.PAYMENT_VERIFIED,
          ACCOMMODATION_STATUS.PAYMENT_DEFERRED,
          ACCOMMODATION_STATUS.HOSTEL_ALLOTTED, // legacy in-flight requests
        ],
      },
      ...overlapFilter(from, to),
    }
    if (excludeRequestId) filter._id = { $ne: excludeRequestId }
    return AccommodationRequest.find(filter)
      .select("persons guests guestAllotments allotment.hostelId")
      .lean()
  },

  // ==================== AccommodationType ====================

  /** Active type config by key (lean). */
  async findActiveTypeByKey(key) {
    return AccommodationType.findOne({ key, isActive: true }).lean()
  },

  /** All active type configs (lean). */
  async listActiveTypes() {
    return AccommodationType.find({ isActive: true }).lean()
  },
}

export default accommodationQueries
