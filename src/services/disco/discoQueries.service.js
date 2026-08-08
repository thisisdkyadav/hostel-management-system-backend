/**
 * DisCo Queries Service
 * ---------------------
 * The single READ surface for the Disciplinary Committee domain — the
 * `DisCoAction` and `DisCoProcessCase` collections. The disco app-service
 * reads through these instead of importing the models, so the collections are
 * touched only inside `src/services/disco/` (writes live in
 * discoOwner.service.js).
 *
 * populate / sort / select choices mirror each original caller EXACTLY:
 *  - bare findById returns a HYDRATED doc for the mutate-then-save flows
 *    (findProcessCaseById, findActionById).
 *  - findProcessCaseByIdDetailed applies the full admin-detail populate chain
 *    that the old `populateAdminCaseDetail` helper built — used for the
 *    get-by-id, export, and post-stage-2 refetch (all previously identical).
 */

import { DisCoAction, DisCoProcessCase } from "../../models/index.js"

// The full admin case-detail populate chain, shared by get-by-id / export /
// the stage-2 save refetch (all three were byte-for-byte identical before).
const applyCaseDetailPopulate = (query) =>
  query
    .populate("submittedBy", "name email")
    .populate("accusingStudentIds", "name email")
    .populate("accusedStudentIds", "name email")
    .populate("statements.studentUserId", "name email")
    .populate("statements.addedBy", "name email")
    .populate("evidenceDocuments.uploadedBy", "name email")
    .populate("extraDocuments.uploadedBy", "name email")
    .populate("emailLogs.sentBy", "name email")
    .populate("committeeMeetingMinutes.uploadedBy", "name email")
    .populate("finalDecision.disciplinedStudentIds", "name email")
    .populate("finalDecision.studentDisciplinaryActions.studentUserId", "name email")
    .populate("finalDecision.decidedBy", "name email")
    .populate("timeline.performedBy", "name email")

export const discoQueries = {
  // ==================== DisCoAction ====================

  /**
   * A student's disciplinary actions, newest first, with actor + reminder
   * completer populated. Mirrors the old BaseService.findAll(filter, {sort,
   * populate}) — returns raw docs (caller maps the view + wraps the envelope).
   */
  async findActionsByStudent(studentId) {
    return DisCoAction.find({ userId: studentId })
      .sort({ date: -1, createdAt: -1 })
      .populate([
        { path: "userId", select: "name email" },
        { path: "reminderItems.doneBy", select: "name email" },
      ])
  },

  /** Date fields only — used to normalize a partial date update. */
  async findActionByIdDateFields(id) {
    return DisCoAction.findById(id).select("date punishmentStartDate punishmentEndDate")
  },

  /** One action, HYDRATED (mutate-then-save: mark reminder item done). */
  async findActionById(id) {
    return DisCoAction.findById(id)
  },

  /** One action with actor + reminder completer populated (post-mutation view). */
  async findActionByIdPopulated(id) {
    return DisCoAction.findById(id)
      .populate("userId", "name email")
      .populate("reminderItems.doneBy", "name email")
  },

  /** Several actions by id, populated (export bundle of created actions). */
  async findActionsByIdsPopulated(ids) {
    return DisCoAction.find({ _id: { $in: ids } })
      .populate("userId", "name email")
      .populate("reminderItems.doneBy", "name email")
  },

  // ==================== DisCoProcessCase ====================

  /** One process case, HYDRATED (every stage-transition mutate-then-save flow). */
  async findProcessCaseById(id) {
    return DisCoProcessCase.findById(id)
  },

  /** One process case with only submitter populated (post-create view). */
  async findProcessCaseByIdWithSubmitter(id) {
    return DisCoProcessCase.findById(id).populate("submittedBy", "name email")
  },

  /** One process case with the full admin-detail populate chain. */
  async findProcessCaseByIdDetailed(id) {
    return applyCaseDetailPopulate(DisCoProcessCase.findById(id))
  },

  /**
   * Admin list page of process cases (submitter + decider populated, newest
   * first). Pagination handled by the caller via { skip, limit }.
   */
  async listProcessCases(filter, { skip, limit }) {
    return DisCoProcessCase.find(filter)
      .populate("submittedBy", "name email")
      .populate("finalDecision.decidedBy", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
  },

  /** Count process cases matching the admin list filter. */
  async countProcessCases(filter) {
    return DisCoProcessCase.countDocuments(filter)
  },
}

export default discoQueries
