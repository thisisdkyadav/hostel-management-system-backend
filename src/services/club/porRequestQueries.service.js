/**
 * POR Request Queries Service
 * ---------------------------
 * The single READ surface for the PorRequest collection. The POR app-service
 * and the best-performer app-service read through these instead of importing
 * the model, so PorRequest is touched only inside `src/services/club/` (writes
 * live in porRequestOwner.service.js).
 *
 * populate/select/lean choices mirror each original caller EXACTLY. List/find
 * methods return HYDRATED docs (callers run legacy-migration mutate+persist and
 * later populate them via populateRequests). Filters are built by the caller.
 */

import { PorRequest } from "../../models/index.js"

// The standard workspace populate applied AFTER legacy migration (two callers).
const REQUEST_POPULATE_SPEC = [
  { path: "submittedBy", select: "name email" },
  { path: "rejectedBy", select: "name email subRole" },
  { path: "currentApproverUser", select: "name email subRole" },
  { path: "currentApproverUsers", select: "name email subRole" },
  { path: "clubId", select: "name email gymkhanaCategoryKey userId" },
  { path: "porCategoryId", select: "name" },
]

export const porRequestQueries = {
  /** A student's requests, newest-updated first (hydrated for migration). */
  async findRequestsBySubmitter(userId) {
    return PorRequest.find({ submittedBy: userId }).sort({ updatedAt: -1 })
  },

  /** Requests matching an access filter, newest-updated first (hydrated). */
  async findRequests(query) {
    return PorRequest.find(query).sort({ updatedAt: -1 })
  },

  /** Populate a hydrated request list in place with the workspace refs. */
  async populateRequests(requests) {
    return PorRequest.populate(requests, REQUEST_POPULATE_SPEC)
  },

  /** Request by id (hydrated — mutate-then-persist and reads). */
  async findRequestById(id) {
    return PorRequest.findById(id)
  },

  /** Request by id with clubId minimally populated (history/certificate access). */
  async findRequestByIdWithClub(id) {
    return PorRequest.findById(id).populate("clubId", "userId gymkhanaCategoryKey")
  },

  /** Request by id, fully populated + lean (email-notification context). */
  async findRequestByIdForEmail(id) {
    return PorRequest.findById(id)
      .populate("submittedBy", "name email")
      .populate("currentApproverUser", "name email subRole role")
      .populate("currentApproverUsers", "name email subRole role")
      .populate("clubId", "name email gymkhanaCategoryKey userId")
      .populate("porCategoryId", "name")
      .lean()
  },

  /** Request by id, fully populated, hydrated (single-request serialization). */
  async findRequestByIdFullPopulated(id) {
    return PorRequest.findById(id)
      .populate("submittedBy", "name email")
      .populate("rejectedBy", "name email subRole")
      .populate("currentApproverUser", "name email subRole")
      .populate("currentApproverUsers", "name email subRole")
      .populate("clubId", "name email gymkhanaCategoryKey userId")
      .populate("porCategoryId", "name")
  },

  /** Requests by id list, submitter + club populated, lean (best-performer proofs). */
  async findRequestsByIdsPopulated(ids) {
    return PorRequest.find({ _id: { $in: ids } })
      .populate("submittedBy", "name email")
      .populate("clubId", "name email gymkhanaCategoryKey userId")
      .lean()
  },

  /** Ids of a user's approved requests within a candidate id list, lean. */
  async findApprovedRequestIdsForUser(ids, userId, approvedStatus) {
    return PorRequest.find({ _id: { $in: ids }, submittedBy: userId, status: approvedStatus })
      .select("_id")
      .lean()
  },
}

export default porRequestQueries
