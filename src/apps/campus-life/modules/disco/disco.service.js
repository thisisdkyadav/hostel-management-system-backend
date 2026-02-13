/**
 * DisCo Service
 * Handles final disciplinary action CRUD and disciplinary process workflow logging.
 */

import mongoose from "mongoose";
import { DisCoAction, DisCoProcessCase, StudentProfile } from "../../../../models/index.js";
import {
  BaseService,
  success,
  notFound,
  badRequest,
  forbidden,
  paginated,
} from "../../../../services/base/index.js";
import { emailCustomService } from "../../../administration/modules/email/email.service.js";

const CASE_STATUS = {
  SUBMITTED: "submitted",
  INITIAL_REJECTED: "initial_rejected",
  UNDER_PROCESS: "under_process",
  FINAL_REJECTED: "final_rejected",
  FINALIZED_WITH_ACTION: "finalized_with_action",
};

const buildTimelineEntry = (action, performedBy, description = "", metadata = {}) => ({
  action,
  performedBy,
  description,
  metadata,
  createdAt: new Date(),
});

const safeFileNameFromUrl = (url, fallback) => {
  if (!url || typeof url !== "string") return fallback;
  const cleaned = url.split("?")[0];
  const segments = cleaned.split("/");
  return segments[segments.length - 1] || fallback;
};

const toStudentCaseView = (caseDoc) => ({
  id: caseDoc._id,
  complaintPdfUrl: caseDoc.complaintPdfUrl,
  complaintPdfName: caseDoc.complaintPdfName,
  initialReview: {
    status: caseDoc.initialReview?.status || "pending",
    decisionDescription: caseDoc.initialReview?.decisionDescription || "",
    decidedAt: caseDoc.initialReview?.decidedAt || null,
  },
  finalDecision: {
    status: caseDoc.finalDecision?.status || "pending",
    decisionDescription: caseDoc.finalDecision?.decisionDescription || "",
    decidedAt: caseDoc.finalDecision?.decidedAt || null,
  },
  createdAt: caseDoc.createdAt,
  updatedAt: caseDoc.updatedAt,
});

const toAdminCaseView = (caseDoc) => ({
  id: caseDoc._id,
  complaintPdfUrl: caseDoc.complaintPdfUrl,
  complaintPdfName: caseDoc.complaintPdfName,
  caseStatus: caseDoc.caseStatus,
  submittedBy: caseDoc.submittedBy
    ? {
        id: caseDoc.submittedBy._id || caseDoc.submittedBy,
        name: caseDoc.submittedBy.name || "",
        email: caseDoc.submittedBy.email || "",
      }
    : null,
  initialReview: {
    status: caseDoc.initialReview?.status || "pending",
    decisionDescription: caseDoc.initialReview?.decisionDescription || "",
    decidedBy: caseDoc.initialReview?.decidedBy
      ? {
          id: caseDoc.initialReview.decidedBy._id || caseDoc.initialReview.decidedBy,
          name: caseDoc.initialReview.decidedBy.name || "",
          email: caseDoc.initialReview.decidedBy.email || "",
        }
      : null,
    decidedAt: caseDoc.initialReview?.decidedAt || null,
  },
  statements: (caseDoc.statements || []).map((statement) => ({
    id: statement._id,
    statementType: statement.statementType,
    statementPdfUrl: statement.statementPdfUrl,
    statementPdfName: statement.statementPdfName,
    student: statement.studentUserId
      ? {
          id: statement.studentUserId._id || statement.studentUserId,
          name: statement.studentUserId.name || "",
          email: statement.studentUserId.email || "",
        }
      : null,
    addedBy: statement.addedBy
      ? {
          id: statement.addedBy._id || statement.addedBy,
          name: statement.addedBy.name || "",
          email: statement.addedBy.email || "",
        }
      : null,
    addedAt: statement.addedAt,
  })),
  emailLogs: (caseDoc.emailLogs || []).map((entry) => ({
    id: entry._id,
    to: entry.to || [],
    subject: entry.subject,
    body: entry.body,
    attachments: entry.attachments || [],
    sentBy: entry.sentBy
      ? {
          id: entry.sentBy._id || entry.sentBy,
          name: entry.sentBy.name || "",
          email: entry.sentBy.email || "",
        }
      : null,
    sentAt: entry.sentAt,
    result: entry.result || { sent: 0, failed: 0, total: 0, errors: [] },
  })),
  committeeMeetingMinutes: caseDoc.committeeMeetingMinutes || {
    pdfUrl: "",
    pdfName: "",
    uploadedBy: null,
    uploadedAt: null,
  },
  finalDecision: {
    status: caseDoc.finalDecision?.status || "pending",
    decisionDescription: caseDoc.finalDecision?.decisionDescription || "",
    disciplinedStudents: (caseDoc.finalDecision?.disciplinedStudentIds || []).map((student) => ({
      id: student?._id || student,
      name: student?.name || "",
      email: student?.email || "",
    })),
    createdDisCoActionIds: caseDoc.finalDecision?.createdDisCoActionIds || [],
    disciplinaryActionTemplate: caseDoc.finalDecision?.disciplinaryActionTemplate || {
      reason: "",
      actionTaken: "",
      date: null,
      remarks: "",
    },
    decidedBy: caseDoc.finalDecision?.decidedBy
      ? {
          id: caseDoc.finalDecision.decidedBy._id || caseDoc.finalDecision.decidedBy,
          name: caseDoc.finalDecision.decidedBy.name || "",
          email: caseDoc.finalDecision.decidedBy.email || "",
        }
      : null,
    decidedAt: caseDoc.finalDecision?.decidedAt || null,
  },
  timeline: (caseDoc.timeline || []).map((entry) => ({
    id: entry._id,
    action: entry.action,
    description: entry.description,
    metadata: entry.metadata || {},
    performedBy: entry.performedBy
      ? {
          id: entry.performedBy._id || entry.performedBy,
          name: entry.performedBy.name || "",
          email: entry.performedBy.email || "",
        }
      : null,
    createdAt: entry.createdAt,
  })),
  createdAt: caseDoc.createdAt,
  updatedAt: caseDoc.updatedAt,
});

class DisCoService extends BaseService {
  constructor() {
    super(DisCoAction, "DisCo action");
  }

  /**
   * Add disciplinary action for a student
   * @param {Object} data - Action data with studentId
   */
  async addDisCoAction(data) {
    const { studentId, reason, actionTaken, date, remarks } = data;

    const studentProfile = await StudentProfile.findOne({ userId: studentId });
    if (!studentProfile) {
      return notFound("Student profile");
    }

    const result = await this.create({
      userId: studentId,
      reason,
      actionTaken,
      date,
      remarks,
    });

    if (result.success) {
      return success({ message: "DisCo action added successfully" }, 201);
    }
    return result;
  }

  /**
   * Get disciplinary actions for a student
   * @param {string} studentId - Student user ID
   */
  async getDisCoActionsByStudent(studentId) {
    const result = await this.findAll(
      { userId: studentId },
      { populate: [{ path: "userId", select: "name email" }] }
    );

    if (result.success) {
      return success({
        success: true,
        message: "Disciplinary actions fetched successfully",
        actions: result.data,
      });
    }
    return result;
  }

  /**
   * Update disciplinary action
   * @param {string} disCoId - DisCo action ID
   * @param {Object} data - Update data
   */
  async updateDisCoAction(disCoId, data) {
    const result = await this.updateById(disCoId, data);
    if (result.success) {
      return success({ message: "DisCo action updated successfully", action: result.data });
    }
    return result;
  }

  /**
   * Delete disciplinary action
   * @param {string} disCoId - DisCo action ID
   */
  async deleteDisCoAction(disCoId) {
    const result = await this.deleteById(disCoId);
    if (result.success) {
      return success({ message: "DisCo action deleted successfully" });
    }
    return result;
  }

  /**
   * Student creates disciplinary process complaint (PDF only).
   */
  async submitProcessCase({ complaintPdfUrl, complaintPdfName }, user) {
    if (!complaintPdfUrl?.trim()) {
      return badRequest("Complaint PDF is required");
    }

    const createdCase = await DisCoProcessCase.create({
      submittedBy: user._id,
      complaintPdfUrl: complaintPdfUrl.trim(),
      complaintPdfName: complaintPdfName?.trim() || safeFileNameFromUrl(complaintPdfUrl, "complaint.pdf"),
      timeline: [
        buildTimelineEntry(
          "case_submitted",
          user._id,
          "Student submitted disciplinary complaint PDF"
        ),
      ],
    });

    return success(
      {
        message: "Disciplinary process complaint submitted",
        case: toStudentCaseView(createdCase),
      },
      201
    );
  }

  /**
   * Student can only see stage-wise statuses of own cases.
   */
  async getMyProcessCases(studentUserId) {
    const cases = await DisCoProcessCase.find({ submittedBy: studentUserId }).sort({ createdAt: -1 });
    return success({
      cases: cases.map(toStudentCaseView),
    });
  }

  /**
   * Admin list view for disciplinary process cases.
   */
  async getAdminProcessCases(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));

    const filter = {};
    if (query.caseStatus) filter.caseStatus = query.caseStatus;
    if (query.initialStatus) filter["initialReview.status"] = query.initialStatus;
    if (query.finalStatus) filter["finalDecision.status"] = query.finalStatus;
    if (query.submittedBy && mongoose.Types.ObjectId.isValid(query.submittedBy)) {
      filter.submittedBy = query.submittedBy;
    }

    const [items, total] = await Promise.all([
      DisCoProcessCase.find(filter)
        .populate("submittedBy", "name email")
        .populate("initialReview.decidedBy", "name email")
        .populate("finalDecision.decidedBy", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      DisCoProcessCase.countDocuments(filter),
    ]);

    return paginated(items.map(toAdminCaseView), { page, limit, total });
  }

  /**
   * Get case by ID.
   */
  async getProcessCaseById(caseId, user) {
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return badRequest("Invalid case id");
    }

    const caseDoc = await DisCoProcessCase.findById(caseId)
      .populate("submittedBy", "name email")
      .populate("initialReview.decidedBy", "name email")
      .populate("statements.studentUserId", "name email")
      .populate("statements.addedBy", "name email")
      .populate("emailLogs.sentBy", "name email")
      .populate("committeeMeetingMinutes.uploadedBy", "name email")
      .populate("finalDecision.disciplinedStudentIds", "name email")
      .populate("finalDecision.decidedBy", "name email")
      .populate("timeline.performedBy", "name email");

    if (!caseDoc) {
      return notFound("Disciplinary process case");
    }

    if (user.role === "Student") {
      if (caseDoc.submittedBy?._id?.toString() !== user._id.toString()) {
        return forbidden("You can only view your own disciplinary cases");
      }
      return success({ case: toStudentCaseView(caseDoc) });
    }

    return success({ case: toAdminCaseView(caseDoc) });
  }

  /**
   * Admin initial review action: process or reject.
   */
  async reviewProcessCase(caseId, { decision, description }, adminUser) {
    if (!["process", "reject"].includes(decision)) {
      return badRequest("Decision must be either process or reject");
    }

    const caseDoc = await DisCoProcessCase.findById(caseId);
    if (!caseDoc) {
      return notFound("Disciplinary process case");
    }

    if (caseDoc.initialReview?.status !== "pending") {
      return badRequest("Initial review is already completed for this case");
    }

    if (decision === "reject" && !description?.trim()) {
      return badRequest("Rejection description is required");
    }

    caseDoc.initialReview.status = decision === "process" ? "processed" : "rejected";
    caseDoc.initialReview.decisionDescription = description?.trim() || "";
    caseDoc.initialReview.decidedBy = adminUser._id;
    caseDoc.initialReview.decidedAt = new Date();
    caseDoc.caseStatus =
      decision === "process" ? CASE_STATUS.UNDER_PROCESS : CASE_STATUS.INITIAL_REJECTED;
    caseDoc.timeline.push(
      buildTimelineEntry(
        decision === "process" ? "initial_review_processed" : "initial_review_rejected",
        adminUser._id,
        description?.trim() || ""
      )
    );
    await caseDoc.save();

    return success({
      message:
        decision === "process"
          ? "Case moved to processing stage"
          : "Case rejected at initial review stage",
      case: toAdminCaseView(caseDoc),
    });
  }

  /**
   * Admin adds a statement document mapped to a student and category.
   */
  async addCaseStatement(caseId, payload, adminUser) {
    const { studentUserId, statementType, statementPdfUrl, statementPdfName } = payload;
    if (!studentUserId || !mongoose.Types.ObjectId.isValid(studentUserId)) {
      return badRequest("Valid student user id is required");
    }
    if (!["accused", "related"].includes(statementType)) {
      return badRequest("statementType must be accused or related");
    }
    if (!statementPdfUrl?.trim()) {
      return badRequest("Statement PDF is required");
    }

    const [caseDoc, studentProfile] = await Promise.all([
      DisCoProcessCase.findById(caseId),
      StudentProfile.findOne({ userId: studentUserId }),
    ]);
    if (!caseDoc) return notFound("Disciplinary process case");
    if (!studentProfile) return badRequest("Student not found for selected user id");

    if (caseDoc.initialReview?.status !== "processed") {
      return badRequest("Case must be in processed stage before adding statements");
    }
    if (caseDoc.finalDecision?.status !== "pending") {
      return badRequest("Cannot edit statements after final decision");
    }

    caseDoc.statements.push({
      studentUserId,
      statementType,
      statementPdfUrl: statementPdfUrl.trim(),
      statementPdfName:
        statementPdfName?.trim() || safeFileNameFromUrl(statementPdfUrl, "statement.pdf"),
      addedBy: adminUser._id,
      addedAt: new Date(),
    });
    caseDoc.timeline.push(
      buildTimelineEntry(
        "statement_added",
        adminUser._id,
        `Statement added for ${statementType} student`,
        { studentUserId, statementType }
      )
    );
    await caseDoc.save();

    return success({ message: "Statement added successfully", case: toAdminCaseView(caseDoc) });
  }

  /**
   * Admin removes statement entry.
   */
  async removeCaseStatement(caseId, statementId, adminUser) {
    const caseDoc = await DisCoProcessCase.findById(caseId);
    if (!caseDoc) return notFound("Disciplinary process case");
    if (caseDoc.finalDecision?.status !== "pending") {
      return badRequest("Cannot edit statements after final decision");
    }

    const statement = caseDoc.statements.id(statementId);
    if (!statement) return notFound("Statement");

    statement.deleteOne();
    caseDoc.timeline.push(
      buildTimelineEntry("statement_removed", adminUser._id, "Statement removed", {
        statementId,
      })
    );
    await caseDoc.save();

    return success({ message: "Statement removed successfully", case: toAdminCaseView(caseDoc) });
  }

  /**
   * Admin sends email with selected case documents and optional extra PDFs.
   */
  async sendCaseEmail(caseId, payload, adminUser) {
    const {
      to,
      subject,
      body,
      includeInitialComplaint = true,
      statementIds = [],
      extraAttachments = [],
    } = payload;

    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    if (recipients.length === 0) return badRequest("At least one recipient email is required");
    if (!subject?.trim()) return badRequest("Email subject is required");
    if (!body?.trim()) return badRequest("Email body is required");

    const caseDoc = await DisCoProcessCase.findById(caseId);
    if (!caseDoc) return notFound("Disciplinary process case");
    if (caseDoc.initialReview?.status !== "processed") {
      return badRequest("Initial review must be processed before sending emails");
    }

    const attachments = [];
    if (includeInitialComplaint) {
      attachments.push({
        sourceType: "initial_complaint",
        sourceId: null,
        fileName: caseDoc.complaintPdfName || safeFileNameFromUrl(caseDoc.complaintPdfUrl, "complaint.pdf"),
        fileUrl: caseDoc.complaintPdfUrl,
      });
    }

    for (const statementId of statementIds) {
      const statement = caseDoc.statements.id(statementId);
      if (!statement) continue;
      attachments.push({
        sourceType: "statement",
        sourceId: statement._id,
        fileName: statement.statementPdfName || safeFileNameFromUrl(statement.statementPdfUrl, "statement.pdf"),
        fileUrl: statement.statementPdfUrl,
      });
    }

    for (const attachment of extraAttachments) {
      if (!attachment?.url) continue;
      attachments.push({
        sourceType: "extra",
        sourceId: null,
        fileName: attachment.fileName || safeFileNameFromUrl(attachment.url, "attachment.pdf"),
        fileUrl: attachment.url,
      });
    }

    const emailResult = await emailCustomService.sendCustomEmail({
      to: recipients,
      subject: subject.trim(),
      body: body.trim(),
      sendType: recipients.length > 1 ? "group" : "individual",
      sentBy: adminUser,
      attachments: attachments.map((item) => ({
        filename: item.fileName,
        url: item.fileUrl,
      })),
    });

    if (!emailResult.success) {
      return badRequest(emailResult.message || "Failed to send email");
    }

    const emailData = emailResult.data || {};
    caseDoc.emailLogs.push({
      to: recipients,
      subject: subject.trim(),
      body: body.trim(),
      attachments,
      sentBy: adminUser._id,
      sentAt: new Date(),
      result: {
        sent: emailData.sent || 0,
        failed: emailData.failed || 0,
        total: emailData.total || recipients.length,
        errors: emailData.errors || [],
      },
    });
    caseDoc.timeline.push(
      buildTimelineEntry("case_email_sent", adminUser._id, "Case email sent", {
        recipients,
        attachmentCount: attachments.length,
      })
    );
    await caseDoc.save();

    return success({
      message: "Email sent and logged successfully",
      emailResult: emailData,
      case: toAdminCaseView(caseDoc),
    });
  }

  /**
   * Admin uploads committee meeting minutes PDF metadata.
   */
  async uploadCommitteeMinutes(caseId, { pdfUrl, pdfName }, adminUser) {
    if (!pdfUrl?.trim()) return badRequest("Meeting minutes PDF is required");

    const caseDoc = await DisCoProcessCase.findById(caseId);
    if (!caseDoc) return notFound("Disciplinary process case");
    if (caseDoc.initialReview?.status !== "processed") {
      return badRequest("Initial review must be processed before uploading meeting minutes");
    }
    if (caseDoc.finalDecision?.status !== "pending") {
      return badRequest("Cannot update meeting minutes after final decision");
    }

    caseDoc.committeeMeetingMinutes = {
      pdfUrl: pdfUrl.trim(),
      pdfName: pdfName?.trim() || safeFileNameFromUrl(pdfUrl, "committee-minutes.pdf"),
      uploadedBy: adminUser._id,
      uploadedAt: new Date(),
    };
    caseDoc.timeline.push(
      buildTimelineEntry(
        "committee_minutes_uploaded",
        adminUser._id,
        "Committee meeting minutes uploaded"
      )
    );
    await caseDoc.save();

    return success({
      message: "Committee meeting minutes uploaded",
      case: toAdminCaseView(caseDoc),
    });
  }

  /**
   * Admin finalizes case by rejecting it or creating DisCo actions for selected students.
   */
  async finalizeCase(caseId, payload, adminUser) {
    const { decision, decisionDescription, studentUserIds = [], reason, actionTaken, date, remarks } = payload;
    if (!["reject", "action"].includes(decision)) {
      return badRequest("decision must be reject or action");
    }

    const caseDoc = await DisCoProcessCase.findById(caseId);
    if (!caseDoc) return notFound("Disciplinary process case");

    if (caseDoc.initialReview?.status !== "processed") {
      return badRequest("Case must be processed in initial review before final decision");
    }
    if (caseDoc.finalDecision?.status !== "pending") {
      return badRequest("Final decision has already been recorded");
    }

    if (decision === "reject") {
      if (!decisionDescription?.trim()) {
        return badRequest("Final rejection description is required");
      }

      caseDoc.finalDecision.status = "rejected";
      caseDoc.finalDecision.decisionDescription = decisionDescription.trim();
      caseDoc.finalDecision.decidedBy = adminUser._id;
      caseDoc.finalDecision.decidedAt = new Date();
      caseDoc.caseStatus = CASE_STATUS.FINAL_REJECTED;
      caseDoc.timeline.push(
        buildTimelineEntry(
          "final_decision_rejected",
          adminUser._id,
          decisionDescription.trim()
        )
      );
      await caseDoc.save();

      return success({
        message: "Case rejected at final stage",
        case: toAdminCaseView(caseDoc),
      });
    }

    if (!reason?.trim()) return badRequest("Disciplinary reason is required");
    if (!actionTaken?.trim()) return badRequest("Action taken is required");
    if (!Array.isArray(studentUserIds) || studentUserIds.length === 0) {
      return badRequest("At least one disciplined student must be selected");
    }

    const uniqueStudentIds = [...new Set(studentUserIds.filter(Boolean))];
    const invalidId = uniqueStudentIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidId) {
      return badRequest("One or more selected student ids are invalid");
    }

    const profiles = await StudentProfile.find({ userId: { $in: uniqueStudentIds } }, "userId");
    const foundUserIds = new Set(profiles.map((profile) => profile.userId.toString()));
    const missing = uniqueStudentIds.filter((id) => !foundUserIds.has(id.toString()));
    if (missing.length > 0) {
      return badRequest("Some selected students do not exist in student profiles");
    }

    const actionDate = date ? new Date(date) : new Date();
    if (Number.isNaN(actionDate.getTime())) {
      return badRequest("Invalid action date");
    }

    const createdActions = await DisCoAction.insertMany(
      uniqueStudentIds.map((studentId) => ({
        userId: studentId,
        reason: reason.trim(),
        actionTaken: actionTaken.trim(),
        date: actionDate,
        remarks: remarks?.trim() || "",
      }))
    );

    caseDoc.finalDecision.status = "action_taken";
    caseDoc.finalDecision.decisionDescription = decisionDescription?.trim() || "";
    caseDoc.finalDecision.disciplinedStudentIds = uniqueStudentIds;
    caseDoc.finalDecision.createdDisCoActionIds = createdActions.map((item) => item._id);
    caseDoc.finalDecision.disciplinaryActionTemplate = {
      reason: reason.trim(),
      actionTaken: actionTaken.trim(),
      date: actionDate,
      remarks: remarks?.trim() || "",
    };
    caseDoc.finalDecision.decidedBy = adminUser._id;
    caseDoc.finalDecision.decidedAt = new Date();
    caseDoc.caseStatus = CASE_STATUS.FINALIZED_WITH_ACTION;
    caseDoc.timeline.push(
      buildTimelineEntry(
        "final_decision_action_taken",
        adminUser._id,
        decisionDescription?.trim() || "Disciplinary action recorded",
        {
          disciplinedStudentsCount: uniqueStudentIds.length,
          createdDisCoActionIds: createdActions.map((item) => item._id),
        }
      )
    );
    await caseDoc.save();

    return success({
      message: "Final disciplinary action recorded successfully",
      createdActions: createdActions.map((action) => action._id),
      case: toAdminCaseView(caseDoc),
    });
  }
}

export const disCoService = new DisCoService();
