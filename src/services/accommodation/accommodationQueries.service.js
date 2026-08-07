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
  ACCOMMODATION_STATUS,
} from "../../models/index.js"

const withSession = (query, session) => (session ? query.session(session) : query)

// Half-open overlap: [aFrom, aTo) intersects [bFrom, bTo) iff aFrom < bTo && bFrom < aTo.
const overlapFilter = (from, to) => ({
  "stay.fromDate": { $lt: new Date(to) },
  "stay.toDate": { $gt: new Date(from) },
})

export const accommodationQueries = {
  // ==================== AccommodationRequest ====================

  /** Hydrated request by id — for mutate-then-persist workflow paths. */
  async findRequestById(requestId, { session } = {}) {
    return withSession(AccommodationRequest.findById(requestId), session)
  },

  /** Lean request by id — read-only surfaces. */
  async findRequestByIdLean(requestId) {
    return AccommodationRequest.findById(requestId).lean()
  },

  /** Count requests matching a filter (list pagination). */
  async countRequests(filter = {}) {
    return AccommodationRequest.countDocuments(filter)
  },

  /** Paginated lean list, newest first. */
  async listRequests(filter = {}, { skip = 0, limit = 10 } = {}) {
    return AccommodationRequest.find(filter)
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
      stageDeadlineAt: { $ne: null, $lte: new Date() },
    })
  },

  /**
   * Hydrated requests whose stay has ended and have no invoice yet
   * (nightly invoicing sweep). Mutated + persisted by the caller in a loop.
   */
  async findDueForInvoicing() {
    return AccommodationRequest.find({
      status: {
        $in: [
          ACCOMMODATION_STATUS.ROOMS_ASSIGNED,
          ACCOMMODATION_STATUS.CHECKED_IN,
          ACCOMMODATION_STATUS.CHECKED_OUT,
        ],
      },
      "stay.toDate": { $lt: new Date() },
      "invoice.generatedAt": null,
    })
  },

  /**
   * Allotted-but-not-yet-room-assigned bookings in a hostel whose stay overlaps
   * [from, to). Drives guest-room availability (their persons still claim the
   * empty pool until rooms are assigned). Returns lean {persons} projections.
   */
  async findOverlappingAllotted({ hostelId, from, to, excludeRequestId } = {}) {
    const filter = {
      "allotment.hostelId": hostelId,
      status: ACCOMMODATION_STATUS.HOSTEL_ALLOTTED,
      ...overlapFilter(from, to),
    }
    if (excludeRequestId) filter._id = { $ne: excludeRequestId }
    return AccommodationRequest.find(filter).select("persons").lean()
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
