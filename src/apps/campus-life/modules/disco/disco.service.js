/**
 * DisCo Service
 * Handles final disciplinary action CRUD and admin-driven disciplinary process workflow.
 */

import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
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
import { fileAccessService } from "../../../../services/storage/file-access.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CASE_STATUS = {
  UNDER_PROCESS: "under_process",
  FINAL_REJECTED: "final_rejected",
  FINALIZED_WITH_ACTION: "finalized_with_action",
};

const FINAL_DECISION_STATUS = {
  PENDING: "pending",
  REJECTED: "rejected",
  ACTION_TAKEN: "action_taken",
};

const ADMIN_DISCIPLINARY_ROLES = new Set([
  "Admin",
  "Super Admin",
  "Warden",
  "Associate Warden",
  "Hostel Supervisor",
]);
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

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

const asIdString = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value._id) return String(value._id);
  return String(value);
};

const toUserRef = (user) => {
  if (!user) return null;
  return {
    id: user._id || user,
    name: user.name || "",
    email: user.email || "",
  };
};

const normalizeStatementRole = (role) => {
  if (role === "related") return "accusing";
  if (role === "accused" || role === "accusing") return role;
  return "";
};

const toUniqueIdArray = (items = []) => {
  if (!Array.isArray(items)) return [];
  return [...new Set(items.filter(Boolean).map((value) => String(value)))];
};

const sanitizeFileNameSegment = (value, fallback = "file") => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return fallback;

  const normalized = trimmed
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/\.+/g, ".")
    .trim()
    .replace(/^\.+|\.+$/g, "");

  return normalized || fallback;
};

const sanitizeArchivePath = (value, fallback = "file") => {
  const segments = String(value || "")
    .split("/")
    .map((segment) => sanitizeFileNameSegment(segment, "item"))
    .filter(Boolean);

  if (segments.length === 0) {
    return sanitizeFileNameSegment(fallback, "file");
  }

  return segments.join("/");
};

const toDosDateTime = (input = new Date()) => {
  const date = input instanceof Date && !Number.isNaN(input.getTime()) ? input : new Date();
  const year = Math.max(date.getFullYear(), 1980);

  return {
    time:
      ((date.getHours() & 0x1f) << 11) |
      ((date.getMinutes() & 0x3f) << 5) |
      (Math.floor(date.getSeconds() / 2) & 0x1f),
    date: (((year - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f),
  };
};

const computeCrc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const createStoredZipBuffer = (entries = []) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const entryName = sanitizeArchivePath(entry?.name, "file");
    const nameBuffer = Buffer.from(entryName, "utf8");
    const dataBuffer = Buffer.isBuffer(entry?.data)
      ? entry.data
      : Buffer.from(typeof entry?.data === "string" ? entry.data : "");
    const crc32 = computeCrc32(dataBuffer);
    const { time, date } = toDosDateTime(entry?.date);
    const utf8Flag = 0x0800;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(utf8Flag, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc32, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(utf8Flag, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc32, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, nameBuffer, dataBuffer);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + dataBuffer.length;
  }

  const centralDirectorySize = centralParts.reduce((size, part) => size + part.length, 0);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectorySize, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, endRecord]);
};

const ensureValidObjectIds = (items = [], label = "ids") => {
  const invalid = items.find((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalid) {
    return badRequest(`Invalid ${label} provided`);
  }
  return null;
};

const normalizeReminderItems = (
  reminderItems,
  { label = "reminder items", includeCompletionMeta = false } = {}
) => {
  if (typeof reminderItems === "undefined") return { list: [] };
  if (!Array.isArray(reminderItems)) {
    return { error: badRequest(`Invalid ${label} provided`) };
  }

  const list = [];
  for (const item of reminderItems) {
    const action = item?.action?.trim();
    if (!action) {
      return { error: badRequest("Each reminder item must include action text") };
    }

    const dueDate = new Date(item?.dueDate);
    if (!item?.dueDate || Number.isNaN(dueDate.getTime())) {
      return { error: badRequest("Each reminder item must include a valid due date") };
    }

    const normalizedItem = {
      action,
      dueDate,
    };

    if (includeCompletionMeta) {
      const isDone = Boolean(item?.isDone);
      let doneAt = null;
      const doneById = item?.doneBy?._id || item?.doneBy || null;
      if (isDone && item?.doneAt) {
        const parsedDoneAt = new Date(item.doneAt);
        if (Number.isNaN(parsedDoneAt.getTime())) {
          return { error: badRequest("Invalid reminder completion date provided") };
        }
        doneAt = parsedDoneAt;
      } else if (isDone) {
        doneAt = new Date();
      }

      normalizedItem.isDone = isDone;
      normalizedItem.doneAt = doneAt;
      normalizedItem.doneBy =
        isDone && doneById && mongoose.Types.ObjectId.isValid(doneById)
          ? doneById
          : null;
    }

    list.push(normalizedItem);
  }

  return { list };
};

const getSelectedStudentIdSet = (caseDoc) => {
  const accusing = toUniqueIdArray(caseDoc.accusingStudentIds || []);
  const accused = toUniqueIdArray(caseDoc.accusedStudentIds || []);
  return new Set([...accusing, ...accused]);
};

const isStageTwoComplete = (caseDoc) => {
  const accusingIds = toUniqueIdArray(caseDoc.accusingStudentIds || []);
  const accusedIds = toUniqueIdArray(caseDoc.accusedStudentIds || []);
  const selectedSet = new Set([...accusingIds, ...accusedIds]);

  if (selectedSet.size === 0) return false;
  if (accusedIds.length === 0) return false;

  const statementCountByStudent = new Map();
  for (const statement of caseDoc.statements || []) {
    const studentId = asIdString(statement.studentUserId);
    if (!selectedSet.has(studentId)) continue;
    if (!statement.statementPdfUrl) return false;

    const existing = statementCountByStudent.get(studentId) || 0;
    statementCountByStudent.set(studentId, existing + 1);
  }

  if (statementCountByStudent.size !== selectedSet.size) return false;
  for (const count of statementCountByStudent.values()) {
    if (count !== 1) return false;
  }

  return true;
};

const populateAdminCaseDetail = (query) =>
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
    .populate("timeline.performedBy", "name email");

const toAdminCaseView = (caseDoc) => ({
  id: caseDoc._id,
  complaintPdfUrl: caseDoc.complaintPdfUrl,
  complaintPdfName: caseDoc.complaintPdfName,
  caseStatus: caseDoc.caseStatus,
  startedBy: toUserRef(caseDoc.submittedBy),
  selectedStudents: {
    accusing: (caseDoc.accusingStudentIds || []).map((student) => ({
      id: student?._id || student,
      name: student?.name || "",
      email: student?.email || "",
    })),
    accused: (caseDoc.accusedStudentIds || []).map((student) => ({
      id: student?._id || student,
      name: student?.name || "",
      email: student?.email || "",
    })),
  },
  statements: (caseDoc.statements || []).map((statement) => ({
    id: statement._id,
    studentRole: normalizeStatementRole(statement.studentRole || statement.statementType),
    statementPdfUrl: statement.statementPdfUrl,
    statementPdfName: statement.statementPdfName,
    student: toUserRef(statement.studentUserId),
    addedBy: toUserRef(statement.addedBy),
    addedAt: statement.addedAt,
  })),
  evidenceDocuments: (caseDoc.evidenceDocuments || []).map((document) => ({
    id: document._id,
    pdfUrl: document.pdfUrl,
    pdfName: document.pdfName,
    uploadedBy: toUserRef(document.uploadedBy),
    uploadedAt: document.uploadedAt,
  })),
  extraDocuments: (caseDoc.extraDocuments || []).map((document) => ({
    id: document._id,
    pdfUrl: document.pdfUrl,
    pdfName: document.pdfName,
    uploadedBy: toUserRef(document.uploadedBy),
    uploadedAt: document.uploadedAt,
  })),
  emailLogs: (caseDoc.emailLogs || []).map((entry) => ({
    id: entry._id,
    to: entry.to || [],
    subject: entry.subject,
    body: entry.body,
    attachments: entry.attachments || [],
    sentBy: toUserRef(entry.sentBy),
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
    status: caseDoc.finalDecision?.status || FINAL_DECISION_STATUS.PENDING,
    decisionDescription: caseDoc.finalDecision?.decisionDescription || "",
    disciplinedStudents: (caseDoc.finalDecision?.disciplinedStudentIds || []).map((student) => ({
      id: student?._id || student,
      name: student?.name || "",
      email: student?.email || "",
    })),
    createdDisCoActionIds: caseDoc.finalDecision?.createdDisCoActionIds || [],
    disciplinaryActionMode: caseDoc.finalDecision?.disciplinaryActionMode || "common",
    disciplinaryActionTemplate: caseDoc.finalDecision?.disciplinaryActionTemplate || {
      reason: "",
      actionTaken: "",
      date: null,
      remarks: "",
      reminderItems: [],
    },
    studentDisciplinaryActions: (caseDoc.finalDecision?.studentDisciplinaryActions || []).map(
      (item) => ({
        id: item._id,
        student: toUserRef(item.studentUserId),
        reason: item.reason || "",
        actionTaken: item.actionTaken || "",
        date: item.date || null,
        remarks: item.remarks || "",
        reminderItems: item.reminderItems || [],
      })
    ),
    decidedBy: toUserRef(caseDoc.finalDecision?.decidedBy),
    decidedAt: caseDoc.finalDecision?.decidedAt || null,
  },
  timeline: (caseDoc.timeline || []).map((entry) => ({
    id: entry._id,
    action: entry.action,
    description: entry.description,
    metadata: entry.metadata || {},
    performedBy: toUserRef(entry.performedBy),
    createdAt: entry.createdAt,
  })),
  createdAt: caseDoc.createdAt,
  updatedAt: caseDoc.updatedAt,
});

const downloadFileBuffer = async (fileUrl) => {
  if (!fileUrl || typeof fileUrl !== "string") {
    throw new Error("Invalid file URL");
  }
  const { buffer } = await fileAccessService.getBuffer(fileUrl);
  return buffer;
};

const formatExportDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
};

const buildCaseSummaryText = ({ caseView, createdActions, exportedAt, warnings }) => {
  const lines = [
    "Disciplinary Process Export",
    `Case ID: ${caseView.id}`,
    `Short ID: ${String(caseView.id || "").slice(-6)}`,
    `Status: ${caseView.caseStatus}`,
    `Started By: ${caseView.startedBy?.name || "Unknown"}${caseView.startedBy?.email ? ` <${caseView.startedBy.email}>` : ""}`,
    `Created At: ${formatExportDateTime(caseView.createdAt)}`,
    `Updated At: ${formatExportDateTime(caseView.updatedAt)}`,
    `Exported At: ${formatExportDateTime(exportedAt)}`,
    "",
    "Selected Students",
    `Accusing: ${(caseView.selectedStudents?.accusing || []).map((student) => student.name || student.email || student.id).join(", ") || "None"}`,
    `Accused: ${(caseView.selectedStudents?.accused || []).map((student) => student.name || student.email || student.id).join(", ") || "None"}`,
    "",
    "Final Decision",
    `Status: ${caseView.finalDecision?.status || "pending"}`,
    `Description: ${caseView.finalDecision?.decisionDescription || "-"}`,
    `Decided By: ${caseView.finalDecision?.decidedBy?.name || "Unknown"}${caseView.finalDecision?.decidedBy?.email ? ` <${caseView.finalDecision.decidedBy.email}>` : ""}`,
    `Decided At: ${formatExportDateTime(caseView.finalDecision?.decidedAt) || "-"}`,
    "",
    "Database Records",
    `Created Disciplinary Actions: ${createdActions.length}`,
  ];

  if (warnings.length > 0) {
    lines.push("", "Warnings");
    warnings.forEach((warning) => lines.push(`- ${warning}`));
  }

  return `${lines.join("\n")}\n`;
};

const buildCreatedActionExportView = (actions = []) =>
  actions.map((action) => ({
    id: action._id,
    user: toUserRef(action.userId),
    reason: action.reason || "",
    actionTaken: action.actionTaken || "",
    date: action.date || null,
    remarks: action.remarks || "",
    reminderItems: (action.reminderItems || []).map((item) => ({
      id: item._id,
      action: item.action || "",
      dueDate: item.dueDate || null,
      isDone: Boolean(item.isDone),
      doneAt: item.doneAt || null,
      doneBy: toUserRef(item.doneBy),
    })),
    createdAt: action.createdAt || null,
    updatedAt: action.updatedAt || null,
  }));

const normalizeCaseDocumentList = ({ documents, uploadedBy, fallbackName }) => {
  if (!documents) return { list: [] };
  if (!Array.isArray(documents)) {
    return { error: badRequest("Invalid document list") };
  }

  const list = [];
  for (const item of documents) {
    if (!item?.pdfUrl?.trim()) {
      return { error: badRequest("Document URL is required") };
    }

    const pdfUrl = item.pdfUrl.trim();
    list.push({
      pdfUrl,
      pdfName: item.pdfName?.trim() || safeFileNameFromUrl(pdfUrl, fallbackName),
      uploadedBy,
      uploadedAt: new Date(),
    });
  }

  return { list };
};

class DisCoService extends BaseService {
  constructor() {
    super(DisCoAction, "DisCo action");
  }

  /**
   * Add disciplinary action for a student
   * @param {Object} data - Action data with studentId
   */
  async addDisCoAction(data) {
    const { studentId, reason, actionTaken, date, remarks, reminderItems } = data;

    const studentProfile = await StudentProfile.findOne({ userId: studentId });
    if (!studentProfile) {
      return notFound("Student profile");
    }

    const actionDate = date ? new Date(date) : new Date();
    if (Number.isNaN(actionDate.getTime())) {
      return badRequest("Invalid action date");
    }

    const normalizedReminderItems = normalizeReminderItems(reminderItems, {
      label: "reminder items",
      includeCompletionMeta: false,
    });
    if (normalizedReminderItems.error) {
      return normalizedReminderItems.error;
    }

    const result = await this.create({
      userId: studentId,
      reason,
      actionTaken,
      date: actionDate,
      remarks,
      reminderItems: normalizedReminderItems.list,
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
      {
        populate: [
          { path: "userId", select: "name email" },
          { path: "reminderItems.doneBy", select: "name email" },
        ],
      }
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
    const updates = { ...data };

    if (Object.prototype.hasOwnProperty.call(data, "date")) {
      if (!data.date) {
        return badRequest("Action date is required");
      }
      const parsedDate = new Date(data.date);
      if (Number.isNaN(parsedDate.getTime())) {
        return badRequest("Invalid action date");
      }
      updates.date = parsedDate;
    }

    if (Object.prototype.hasOwnProperty.call(data, "reminderItems")) {
      const normalizedReminderItems = normalizeReminderItems(data.reminderItems, {
        label: "reminder items",
        includeCompletionMeta: true,
      });
      if (normalizedReminderItems.error) {
        return normalizedReminderItems.error;
      }
      updates.reminderItems = normalizedReminderItems.list;
    }

    const result = await this.updateById(disCoId, updates);
    if (result.success) {
      return success({ message: "DisCo action updated successfully", action: result.data });
    }
    return result;
  }

  /**
   * Mark a reminder item as completed.
   */
  async markReminderItemDone(disCoId, reminderItemId, currentUser) {
    if (!mongoose.Types.ObjectId.isValid(disCoId)) {
      return badRequest("Invalid DisCo action id");
    }

    if (!mongoose.Types.ObjectId.isValid(reminderItemId)) {
      return badRequest("Invalid reminder item id");
    }

    const actionDoc = await DisCoAction.findById(disCoId);
    if (!actionDoc) return notFound("DisCo action");

    const isOwner = String(actionDoc.userId) === String(currentUser?._id);
    const canManage = ADMIN_DISCIPLINARY_ROLES.has(currentUser?.role);
    if (!isOwner && !canManage) {
      return forbidden("You are not allowed to update this reminder");
    }

    const reminderDoc = actionDoc.reminderItems.id(reminderItemId);
    if (!reminderDoc) return notFound("Reminder item");

    const wasAlreadyDone = Boolean(reminderDoc.isDone);

    if (!wasAlreadyDone) {
      reminderDoc.isDone = true;
      reminderDoc.doneAt = new Date();
      reminderDoc.doneBy = currentUser?._id || null;
      await actionDoc.save();
    }

    const populatedAction = await DisCoAction.findById(disCoId)
      .populate("userId", "name email")
      .populate("reminderItems.doneBy", "name email");

    return success({
      message: wasAlreadyDone
        ? "Reminder item already completed"
        : "Reminder item marked as completed",
      action: populatedAction,
    });
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
   * Admin creates a disciplinary process case by uploading complaint PDF.
   */
  async submitProcessCase({ complaintPdfUrl, complaintPdfName }, adminUser) {
    if (!complaintPdfUrl?.trim()) {
      return badRequest("Complaint PDF is required");
    }

    const createdCase = await DisCoProcessCase.create({
      submittedBy: adminUser._id,
      complaintPdfUrl: complaintPdfUrl.trim(),
      complaintPdfName:
        complaintPdfName?.trim() || safeFileNameFromUrl(complaintPdfUrl, "complaint.pdf"),
      caseStatus: CASE_STATUS.UNDER_PROCESS,
      timeline: [
        buildTimelineEntry(
          "case_created",
          adminUser._id,
          "Admin created disciplinary process case"
        ),
      ],
    });

    const caseWithUser = await DisCoProcessCase.findById(createdCase._id).populate(
      "submittedBy",
      "name email"
    );

    return success(
      {
        message: "Disciplinary process case created",
        case: toAdminCaseView(caseWithUser),
      },
      201
    );
  }

  /**
   * Admin list view for disciplinary process cases.
   */
  async getAdminProcessCases(query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));

    const filter = {};
    if (query.caseStatus) filter.caseStatus = query.caseStatus;
    if (query.startedBy && mongoose.Types.ObjectId.isValid(query.startedBy)) {
      filter.submittedBy = query.startedBy;
    }

    const [items, total] = await Promise.all([
      DisCoProcessCase.find(filter)
        .populate("submittedBy", "name email")
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
  async getProcessCaseById(caseId) {
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return badRequest("Invalid case id");
    }

    const caseDoc = await populateAdminCaseDetail(DisCoProcessCase.findById(caseId));

    if (!caseDoc) {
      return notFound("Disciplinary process case");
    }

    return success({ case: toAdminCaseView(caseDoc) });
  }

  async exportProcessCaseBundle(caseId) {
    if (!mongoose.Types.ObjectId.isValid(caseId)) {
      return badRequest("Invalid case id");
    }

    const caseDoc = await populateAdminCaseDetail(DisCoProcessCase.findById(caseId));
    if (!caseDoc) {
      return notFound("Disciplinary process case");
    }

    if (caseDoc.finalDecision?.status === FINAL_DECISION_STATUS.PENDING) {
      return badRequest("Only completed cases can be exported");
    }

    const createdActions = (caseDoc.finalDecision?.createdDisCoActionIds || []).length
      ? await DisCoAction.find({ _id: { $in: caseDoc.finalDecision.createdDisCoActionIds } })
        .populate("userId", "name email")
        .populate("reminderItems.doneBy", "name email")
      : [];

    const caseView = toAdminCaseView(caseDoc);
    const warnings = [];
    const archiveEntries = [];
    const exportedAt = new Date();
    const shortCaseId = String(caseView.id || "").slice(-6) || "case";
    const fileNameCounters = new Map();

    const buildUniqueArchivePath = (basePath, preferredName) => {
      const archiveBase = sanitizeArchivePath(basePath, "documents");
      const safeName = sanitizeFileNameSegment(preferredName, "document.pdf");
      const key = `${archiveBase}/${safeName}`;
      const currentCount = fileNameCounters.get(key) || 0;
      fileNameCounters.set(key, currentCount + 1);

      if (currentCount === 0) {
        return `${archiveBase}/${safeName}`;
      }

      const parsed = path.parse(safeName);
      const suffix = `-${currentCount + 1}`;
      return `${archiveBase}/${parsed.name || "document"}${suffix}${parsed.ext || ""}`;
    };

    const pushArchiveFile = async ({ archivePath, fileUrl, fallbackName, warningLabel }) => {
      try {
        const data = await downloadFileBuffer(fileUrl);
        archiveEntries.push({
          name: buildUniqueArchivePath(archivePath, fallbackName || safeFileNameFromUrl(fileUrl, "document.pdf")),
          data,
        });
      } catch (error) {
        warnings.push(`${warningLabel} could not be included (${error.message})`);
      }
    };

    await pushArchiveFile({
      archivePath: "documents/complaint",
      fileUrl: caseView.complaintPdfUrl,
      fallbackName: caseView.complaintPdfName || "complaint.pdf",
      warningLabel: "Complaint PDF",
    });

    for (const statement of caseView.statements || []) {
      const studentLabel = sanitizeFileNameSegment(
        statement.student?.name || statement.student?.email || statement.student?.id || "student",
        "student"
      );
      await pushArchiveFile({
        archivePath: `documents/statements/${statement.studentRole || "student"}`,
        fileUrl: statement.statementPdfUrl,
        fallbackName: `${studentLabel}-${statement.statementPdfName || "statement.pdf"}`,
        warningLabel: `Statement for ${studentLabel}`,
      });
    }

    for (const document of caseView.evidenceDocuments || []) {
      await pushArchiveFile({
        archivePath: "documents/evidence",
        fileUrl: document.pdfUrl,
        fallbackName: document.pdfName || "evidence.pdf",
        warningLabel: `Evidence document ${document.pdfName || ""}`.trim(),
      });
    }

    for (const document of caseView.extraDocuments || []) {
      await pushArchiveFile({
        archivePath: "documents/extra-documents",
        fileUrl: document.pdfUrl,
        fallbackName: document.pdfName || "extra-document.pdf",
        warningLabel: `Extra document ${document.pdfName || ""}`.trim(),
      });
    }

    if (caseView.committeeMeetingMinutes?.pdfUrl) {
      await pushArchiveFile({
        archivePath: "documents/committee-minutes",
        fileUrl: caseView.committeeMeetingMinutes.pdfUrl,
        fallbackName: caseView.committeeMeetingMinutes.pdfName || "committee-minutes.pdf",
        warningLabel: "Committee meeting minutes",
      });
    }

    for (const [emailIndex, emailLog] of (caseView.emailLogs || []).entries()) {
      for (const attachment of emailLog.attachments || []) {
        await pushArchiveFile({
          archivePath: `documents/email-attachments/email-${emailIndex + 1}`,
          fileUrl: attachment.fileUrl,
          fallbackName: attachment.fileName || safeFileNameFromUrl(attachment.fileUrl, "attachment.pdf"),
          warningLabel: `Email attachment ${attachment.fileName || attachment.fileUrl}`,
        });
      }
    }

    const exportPayload = {
      exportedAt,
      case: caseView,
      createdDisciplinaryActions: buildCreatedActionExportView(createdActions),
      warnings,
    };

    archiveEntries.unshift(
      {
        name: "README.txt",
        data: buildCaseSummaryText({
          caseView,
          createdActions,
          exportedAt,
          warnings,
        }),
      },
      {
        name: "case-data.json",
        data: JSON.stringify(exportPayload, null, 2),
      }
    );

    if (warnings.length > 0) {
      archiveEntries.push({
        name: "missing-files.txt",
        data: `${warnings.join("\n")}\n`,
      });
    }

    return success(
      {
        fileName: sanitizeFileNameSegment(`disciplinary-case-${shortCaseId}.zip`, `disciplinary-case-${shortCaseId}.zip`),
        contentType: "application/zip",
        buffer: createStoredZipBuffer(archiveEntries),
      },
      200
    );
  }

  /**
   * Save stage 2: involved students and document sets.
   */
  async saveCaseStageTwo(caseId, payload, adminUser) {
    const {
      accusingStudentIds = [],
      accusedStudentIds = [],
      statements = [],
      evidenceDocuments = [],
      extraDocuments = [],
    } = payload;

    const caseDoc = await DisCoProcessCase.findById(caseId);
    if (!caseDoc) return notFound("Disciplinary process case");

    if (caseDoc.finalDecision?.status !== FINAL_DECISION_STATUS.PENDING) {
      return badRequest("Cannot edit stage 2 after final decision");
    }

    const uniqueAccusingIds = toUniqueIdArray(accusingStudentIds);
    const uniqueAccusedIds = toUniqueIdArray(accusedStudentIds);

    const invalidAccusing = ensureValidObjectIds(uniqueAccusingIds, "accusing student ids");
    if (invalidAccusing) return invalidAccusing;

    const invalidAccused = ensureValidObjectIds(uniqueAccusedIds, "accused student ids");
    if (invalidAccused) return invalidAccused;

    if (uniqueAccusedIds.length === 0) {
      return badRequest("Select at least one accused student");
    }

    const overlapSet = uniqueAccusingIds.filter((id) => uniqueAccusedIds.includes(id));
    if (overlapSet.length > 0) {
      return badRequest("A student cannot be in both accusing and accused groups");
    }

    const selectedIds = [...new Set([...uniqueAccusingIds, ...uniqueAccusedIds])];
    if (selectedIds.length === 0) {
      return badRequest("Select at least one student");
    }

    const studentProfiles = await StudentProfile.find({ userId: { $in: selectedIds } }, "userId");
    const foundUserIds = new Set(studentProfiles.map((profile) => String(profile.userId)));
    const missingStudents = selectedIds.filter((id) => !foundUserIds.has(String(id)));
    if (missingStudents.length > 0) {
      return badRequest("Some selected students do not exist in student profiles");
    }

    if (!Array.isArray(statements) || statements.length !== selectedIds.length) {
      return badRequest(
        "Upload exactly one statement PDF for every selected student in both groups"
      );
    }

    const accusedSet = new Set(uniqueAccusedIds);

    const statementMap = new Map();
    for (const statement of statements) {
      const studentUserId = String(statement?.studentUserId || "");
      if (!studentUserId || !selectedIds.includes(studentUserId)) {
        return badRequest("Each statement must reference a selected student");
      }

      if (statementMap.has(studentUserId)) {
        return badRequest("Only one statement per selected student is allowed");
      }

      if (!statement?.statementPdfUrl?.trim()) {
        return badRequest("Statement PDF is required for each selected student");
      }

      const expectedRole = accusedSet.has(studentUserId) ? "accused" : "accusing";
      const providedRole = normalizeStatementRole(statement.studentRole || statement.statementType);

      if (providedRole && providedRole !== expectedRole) {
        return badRequest("Statement student role does not match selected student group");
      }

      const statementPdfUrl = statement.statementPdfUrl.trim();
      statementMap.set(studentUserId, {
        studentUserId,
        studentRole: expectedRole,
        statementPdfUrl,
        statementPdfName:
          statement.statementPdfName?.trim() ||
          safeFileNameFromUrl(statementPdfUrl, "statement.pdf"),
        addedBy: adminUser._id,
        addedAt: new Date(),
      });
    }

    if (statementMap.size !== selectedIds.length) {
      return badRequest("Statement is missing for one or more selected students");
    }

    const statementsPayload = selectedIds.map((studentId) => statementMap.get(studentId));

    const normalizedEvidence = normalizeCaseDocumentList({
      documents: evidenceDocuments,
      uploadedBy: adminUser._id,
      fallbackName: "evidence.pdf",
    });
    if (normalizedEvidence.error) return normalizedEvidence.error;

    const normalizedExtra = normalizeCaseDocumentList({
      documents: extraDocuments,
      uploadedBy: adminUser._id,
      fallbackName: "extra-document.pdf",
    });
    if (normalizedExtra.error) return normalizedExtra.error;

    caseDoc.accusingStudentIds = uniqueAccusingIds;
    caseDoc.accusedStudentIds = uniqueAccusedIds;
    caseDoc.statements = statementsPayload;
    caseDoc.evidenceDocuments = normalizedEvidence.list;
    caseDoc.extraDocuments = normalizedExtra.list;
    caseDoc.caseStatus = CASE_STATUS.UNDER_PROCESS;
    caseDoc.timeline.push(
      buildTimelineEntry(
        "stage2_documents_saved",
        adminUser._id,
        "Stage 2 documents saved",
        {
          accusingStudentsCount: uniqueAccusingIds.length,
          accusedStudentsCount: uniqueAccusedIds.length,
          statementsCount: statementsPayload.length,
          evidenceDocumentsCount: normalizedEvidence.list.length,
          extraDocumentsCount: normalizedExtra.list.length,
        }
      )
    );

    await caseDoc.save();

    const populatedCaseDoc = await DisCoProcessCase.findById(caseDoc._id)
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
      .populate("timeline.performedBy", "name email");

    return success({
      message: "Stage 2 saved successfully",
      case: toAdminCaseView(populatedCaseDoc),
    });
  }

  /**
   * Admin sends committee email with selected case documents and optional extra PDFs.
   */
  async sendCaseEmail(caseId, payload, adminUser) {
    const {
      to,
      subject,
      body,
      includeInitialComplaint = true,
      statementIds = [],
      evidenceIds = [],
      extraDocumentIds = [],
      extraAttachments = [],
    } = payload;

    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
    if (recipients.length === 0) return badRequest("At least one recipient email is required");
    if (!subject?.trim()) return badRequest("Email subject is required");
    if (!body?.trim()) return badRequest("Email body is required");

    const caseDoc = await DisCoProcessCase.findById(caseId);
    if (!caseDoc) return notFound("Disciplinary process case");

    if (caseDoc.finalDecision?.status !== FINAL_DECISION_STATUS.PENDING) {
      return badRequest("Cannot send emails after final decision");
    }

    if (!isStageTwoComplete(caseDoc)) {
      return badRequest("Complete stage 2 documents before sending committee email");
    }

    const attachments = [];

    if (includeInitialComplaint) {
      attachments.push({
        sourceType: "initial_complaint",
        sourceId: null,
        fileName:
          caseDoc.complaintPdfName ||
          safeFileNameFromUrl(caseDoc.complaintPdfUrl, "complaint.pdf"),
        fileUrl: caseDoc.complaintPdfUrl,
      });
    }

    const selectedStatementIds = toUniqueIdArray(
      statementIds.length > 0
        ? statementIds
        : (caseDoc.statements || []).map((statement) => statement._id)
    );
    const selectedEvidenceIds = toUniqueIdArray(
      evidenceIds.length > 0
        ? evidenceIds
        : (caseDoc.evidenceDocuments || []).map((document) => document._id)
    );
    const selectedExtraDocumentIds = toUniqueIdArray(
      extraDocumentIds.length > 0
        ? extraDocumentIds
        : (caseDoc.extraDocuments || []).map((document) => document._id)
    );

    for (const statement of caseDoc.statements || []) {
      const statementId = asIdString(statement._id);
      if (!selectedStatementIds.includes(statementId)) continue;

      attachments.push({
        sourceType: "statement",
        sourceId: statement._id,
        fileName:
          statement.statementPdfName ||
          safeFileNameFromUrl(statement.statementPdfUrl, "statement.pdf"),
        fileUrl: statement.statementPdfUrl,
      });
    }

    for (const document of caseDoc.evidenceDocuments || []) {
      const documentId = asIdString(document._id);
      if (!selectedEvidenceIds.includes(documentId)) continue;

      attachments.push({
        sourceType: "evidence",
        sourceId: document._id,
        fileName:
          document.pdfName || safeFileNameFromUrl(document.pdfUrl, "evidence.pdf"),
        fileUrl: document.pdfUrl,
      });
    }

    for (const document of caseDoc.extraDocuments || []) {
      const documentId = asIdString(document._id);
      if (!selectedExtraDocumentIds.includes(documentId)) continue;

      attachments.push({
        sourceType: "extra_document",
        sourceId: document._id,
        fileName:
          document.pdfName ||
          safeFileNameFromUrl(document.pdfUrl, "extra-document.pdf"),
        fileUrl: document.pdfUrl,
      });
    }

    for (const attachment of extraAttachments) {
      if (!attachment?.url) continue;
      attachments.push({
        sourceType: "extra",
        sourceId: null,
        fileName:
          attachment.fileName || safeFileNameFromUrl(attachment.url, "attachment.pdf"),
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
      buildTimelineEntry("committee_email_sent", adminUser._id, "Committee email sent", {
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
   * Admin explicitly skips committee email stage and proceeds.
   */
  async skipCaseEmail(caseId, payload = {}, adminUser) {
    const reason = String(payload?.reason || "").trim();

    const caseDoc = await DisCoProcessCase.findById(caseId);
    if (!caseDoc) return notFound("Disciplinary process case");

    if (caseDoc.finalDecision?.status !== FINAL_DECISION_STATUS.PENDING) {
      return badRequest("Cannot skip committee email after final decision");
    }

    if (!isStageTwoComplete(caseDoc)) {
      return badRequest("Complete stage 2 documents before skipping committee email");
    }

    if ((caseDoc.emailLogs || []).length > 0) {
      return badRequest("Committee email step is already completed");
    }

    const defaultSubject = "Committee email step skipped";
    const defaultBody =
      reason ||
      "Email stage intentionally skipped by admin. Proceeding directly to committee minutes.";

    caseDoc.emailLogs.push({
      to: [],
      subject: defaultSubject,
      body: defaultBody,
      attachments: [],
      sentBy: adminUser._id,
      sentAt: new Date(),
      result: {
        sent: 0,
        failed: 0,
        total: 0,
        errors: [],
      },
    });
    caseDoc.timeline.push(
      buildTimelineEntry(
        "committee_email_skipped",
        adminUser._id,
        "Committee email stage skipped",
        { reason: defaultBody }
      )
    );

    await caseDoc.save();

    return success({
      message: "Committee email step skipped",
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

    if (caseDoc.finalDecision?.status !== FINAL_DECISION_STATUS.PENDING) {
      return badRequest("Cannot update meeting minutes after final decision");
    }

    if (!isStageTwoComplete(caseDoc)) {
      return badRequest("Complete stage 2 documents before uploading meeting minutes");
    }

    if ((caseDoc.emailLogs || []).length === 0) {
      return badRequest("Send committee email before uploading meeting minutes");
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
    const {
      decision,
      decisionDescription,
      actionMode = "common",
      studentUserIds = [],
      studentActions = [],
      reason,
      actionTaken,
      date,
      remarks,
      reminderItems = [],
    } = payload;

    if (!["reject", "action"].includes(decision)) {
      return badRequest("decision must be reject or action");
    }

    const caseDoc = await DisCoProcessCase.findById(caseId);
    if (!caseDoc) return notFound("Disciplinary process case");

    if (caseDoc.finalDecision?.status !== FINAL_DECISION_STATUS.PENDING) {
      return badRequest("Final decision has already been recorded");
    }

    if (!isStageTwoComplete(caseDoc)) {
      return badRequest("Complete stage 2 documents before final decision");
    }

    if ((caseDoc.emailLogs || []).length === 0) {
      return badRequest("Send committee email before final decision");
    }

    if (!caseDoc.committeeMeetingMinutes?.pdfUrl) {
      return badRequest("Upload committee meeting minutes before final decision");
    }

    if (decision === "reject") {
      if (!decisionDescription?.trim()) {
        return badRequest("Final rejection description is required");
      }

      caseDoc.finalDecision.status = FINAL_DECISION_STATUS.REJECTED;
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

    if (!["common", "per_student"].includes(actionMode)) {
      return badRequest("actionMode must be common or per_student");
    }

    let uniqueStudentIds = [];
    let actionDocuments = [];
    let disciplinaryActionTemplate = {
      reason: "",
      actionTaken: "",
      date: null,
      remarks: "",
      reminderItems: [],
    };
    let studentDisciplinaryActions = [];

    if (actionMode === "common") {
      if (!reason?.trim()) return badRequest("Disciplinary reason is required");
      if (!actionTaken?.trim()) return badRequest("Action taken is required");
      if (!Array.isArray(studentUserIds) || studentUserIds.length === 0) {
        return badRequest("At least one disciplined student must be selected");
      }

      uniqueStudentIds = toUniqueIdArray(studentUserIds);
      const actionDate = date ? new Date(date) : new Date();
      if (Number.isNaN(actionDate.getTime())) {
        return badRequest("Invalid action date");
      }

      const normalizedReminderItems = normalizeReminderItems(reminderItems, {
        label: "reminder items",
        includeCompletionMeta: false,
      });
      if (normalizedReminderItems.error) {
        return normalizedReminderItems.error;
      }

      actionDocuments = uniqueStudentIds.map((studentId) => ({
        userId: studentId,
        reason: reason.trim(),
        actionTaken: actionTaken.trim(),
        date: actionDate,
        remarks: remarks?.trim() || "",
        reminderItems: normalizedReminderItems.list,
      }));

      disciplinaryActionTemplate = {
        reason: reason.trim(),
        actionTaken: actionTaken.trim(),
        date: actionDate,
        remarks: remarks?.trim() || "",
        reminderItems: normalizedReminderItems.list,
      };

      studentDisciplinaryActions = uniqueStudentIds.map((studentId) => ({
        studentUserId: studentId,
        reason: reason.trim(),
        actionTaken: actionTaken.trim(),
        date: actionDate,
        remarks: remarks?.trim() || "",
        reminderItems: normalizedReminderItems.list,
      }));
    } else {
      if (!Array.isArray(studentActions) || studentActions.length === 0) {
        return badRequest("Provide at least one per-student action");
      }

      const studentActionMap = new Map();
      for (const item of studentActions) {
        const studentUserId = String(item?.studentUserId || "");
        if (!studentUserId) {
          return badRequest("Each per-student action must include studentUserId");
        }

        if (studentActionMap.has(studentUserId)) {
          return badRequest("Duplicate per-student action provided");
        }

        if (!item?.reason?.trim()) {
          return badRequest("Each per-student action must include reason");
        }

        if (!item?.actionTaken?.trim()) {
          return badRequest("Each per-student action must include actionTaken");
        }

        const perStudentDate = item?.date ? new Date(item.date) : new Date();
        if (Number.isNaN(perStudentDate.getTime())) {
          return badRequest("Invalid action date in per-student action");
        }

        const normalizedReminderItems = normalizeReminderItems(item?.reminderItems, {
          label: "per-student reminder items",
          includeCompletionMeta: false,
        });
        if (normalizedReminderItems.error) {
          return normalizedReminderItems.error;
        }

        studentActionMap.set(studentUserId, {
          studentUserId,
          reason: item.reason.trim(),
          actionTaken: item.actionTaken.trim(),
          date: perStudentDate,
          remarks: item?.remarks?.trim() || "",
          reminderItems: normalizedReminderItems.list,
        });
      }

      uniqueStudentIds = Array.from(studentActionMap.keys());
      actionDocuments = uniqueStudentIds.map((studentId) => ({
        userId: studentId,
        reason: studentActionMap.get(studentId).reason,
        actionTaken: studentActionMap.get(studentId).actionTaken,
        date: studentActionMap.get(studentId).date,
        remarks: studentActionMap.get(studentId).remarks,
        reminderItems: studentActionMap.get(studentId).reminderItems,
      }));
      studentDisciplinaryActions = uniqueStudentIds.map((studentId) => ({
        ...studentActionMap.get(studentId),
      }));
    }

    const invalidId = ensureValidObjectIds(uniqueStudentIds, "disciplined student ids");
    if (invalidId) return invalidId;

    const allowedStudentIds = getSelectedStudentIdSet(caseDoc);
    const outsideSelectedStudents = uniqueStudentIds.filter((id) => !allowedStudentIds.has(id));
    if (outsideSelectedStudents.length > 0) {
      return badRequest("Disciplined students must be selected from stage 2 student groups");
    }

    const profiles = await StudentProfile.find({ userId: { $in: uniqueStudentIds } }, "userId");
    const foundUserIds = new Set(profiles.map((profile) => String(profile.userId)));
    const missing = uniqueStudentIds.filter((id) => !foundUserIds.has(id));
    if (missing.length > 0) {
      return badRequest("Some selected students do not exist in student profiles");
    }

    const createdActions = await DisCoAction.insertMany(actionDocuments);

    caseDoc.finalDecision.status = FINAL_DECISION_STATUS.ACTION_TAKEN;
    caseDoc.finalDecision.decisionDescription = decisionDescription?.trim() || "";
    caseDoc.finalDecision.disciplinedStudentIds = uniqueStudentIds;
    caseDoc.finalDecision.createdDisCoActionIds = createdActions.map((item) => item._id);
    caseDoc.finalDecision.disciplinaryActionMode = actionMode;
    caseDoc.finalDecision.disciplinaryActionTemplate = disciplinaryActionTemplate;
    caseDoc.finalDecision.studentDisciplinaryActions = studentDisciplinaryActions;
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
          disciplinaryActionMode: actionMode,
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
