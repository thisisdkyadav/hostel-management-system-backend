/**
 * JR Appointments Service
 * Handles public appointment requests for meeting Joint Registrar SA,
 * admin review workflow, and hostel gate entry tracking.
 */

import mongoose from "mongoose";
import { JRAppointment } from "../../../../models/index.js";
import {
  BaseService,
  success,
  badRequest,
  forbidden,
  notFound,
  paginated,
} from "../../../../services/base/index.js";
import { emailCustomService } from "../../../administration/modules/email/email.service.js";
import { ROLES, SUBROLES } from "../../../../core/constants/index.js";

const STATUS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

const parseDateOnly = (value) => {
  if (!value) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    const dateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateMatch) {
      const year = Number.parseInt(dateMatch[1], 10);
      const monthIndex = Number.parseInt(dateMatch[2], 10) - 1;
      const day = Number.parseInt(dateMatch[3], 10);
      const parsed = new Date(year, monthIndex, day);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    const fallback = new Date(trimmed);
    if (!Number.isNaN(fallback.getTime())) {
      return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
    }
  }

  return null;
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const minimumPreferredDate = () => {
  const minDate = startOfToday();
  minDate.setDate(minDate.getDate() + 2);
  return minDate;
};

const toUserView = (userDoc) => {
  if (!userDoc) return null;
  return {
    id: userDoc._id || userDoc,
    name: userDoc.name || "",
    email: userDoc.email || "",
  };
};

const toAppointmentView = (appointmentDoc) => ({
  id: appointmentDoc._id,
  visitorName: appointmentDoc.visitorName,
  mobileNumber: appointmentDoc.mobileNumber,
  email: appointmentDoc.email,
  idType: appointmentDoc.idType,
  idNumber: appointmentDoc.idNumber,
  reason: appointmentDoc.reason,
  preferredDate: appointmentDoc.preferredDate,
  preferredTime: appointmentDoc.preferredTime,
  status: appointmentDoc.status,
  review: {
    reviewedBy: toUserView(appointmentDoc.review?.reviewedBy),
    reviewedAt: appointmentDoc.review?.reviewedAt || null,
    action: appointmentDoc.review?.action || null,
    description: appointmentDoc.review?.description || "",
  },
  approvedMeeting: {
    date: appointmentDoc.approvedMeeting?.date || null,
    time: appointmentDoc.approvedMeeting?.time || "",
  },
  gateEntry: {
    entered: Boolean(appointmentDoc.gateEntry?.entered),
    enteredAt: appointmentDoc.gateEntry?.enteredAt || null,
    markedBy: toUserView(appointmentDoc.gateEntry?.markedBy),
    note: appointmentDoc.gateEntry?.note || "",
  },
  createdAt: appointmentDoc.createdAt,
  updatedAt: appointmentDoc.updatedAt,
});

const normalizePublicPayload = (payload = {}) => ({
  visitorName: payload.visitorName?.trim(),
  mobileNumber: payload.mobileNumber?.trim(),
  email: payload.email?.trim()?.toLowerCase(),
  idType: payload.idType,
  idNumber: payload.idNumber?.trim(),
  reason: payload.reason?.trim(),
  preferredDate: parseDateOnly(payload.preferredDate),
  preferredTime: payload.preferredTime?.trim(),
});

const isJRReviewer = (user) =>
  user?.role === ROLES.ADMIN && user?.subRole === SUBROLES.JOINT_REGISTRAR_SA;

const isGateUser = (user) => user?.role === ROLES.HOSTEL_GATE;

const buildDecisionEmailBody = ({ appointment, action, description, approvedDate, approvedTime }) => {
  const friendlyAction = action === "approve" ? "approved" : "rejected";
  const lines = [
    `Dear ${appointment.visitorName},`,
    "",
    `Your appointment request to meet Joint Registrar has been ${friendlyAction}.`,
  ];

  if (action === "approve") {
    lines.push("", `Meeting Date: ${approvedDate}`, `Meeting Time: ${approvedTime}`);
  }

  if (description) {
    lines.push("", "Remarks:", description);
  }

  lines.push("", "Regards,", "Joint Registrar Office");
  return lines.join("\n");
};

class JRAppointmentsService extends BaseService {
  constructor() {
    super(JRAppointment, "JR appointment");
  }

  async submitPublicAppointment(payload = {}) {
    const normalized = normalizePublicPayload(payload);

    const requiredFields = [
      "visitorName",
      "mobileNumber",
      "email",
      "idType",
      "idNumber",
      "reason",
      "preferredDate",
      "preferredTime",
    ];

    const missingField = requiredFields.find((field) => !normalized[field]);
    if (missingField) {
      return badRequest(`Missing required field: ${missingField}`);
    }

    if (!["Aadhaar", "PAN"].includes(normalized.idType)) {
      return badRequest("ID type must be Aadhaar or PAN");
    }

    const mobileOnlyDigits = normalized.mobileNumber.replace(/\D/g, "");
    if (mobileOnlyDigits.length < 10 || mobileOnlyDigits.length > 15) {
      return badRequest("Please provide a valid mobile number");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalized.email)) {
      return badRequest("Please provide a valid email address");
    }

    const minDate = minimumPreferredDate();
    if (!normalized.preferredDate || normalized.preferredDate < minDate) {
      return badRequest("Preferred date must be at least day-after-tomorrow");
    }

    const created = await JRAppointment.create(normalized);

    return success(
      {
        message: "Appointment request submitted successfully",
        appointment: toAppointmentView(created),
      },
      201
    );
  }

  async getAdminAppointments(user, query = {}) {
    if (!isJRReviewer(user)) {
      return forbidden("Only Joint Registrar SA can access these appointments");
    }

    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 10));

    const filter = {};

    if (query.status && [STATUS.PENDING, STATUS.APPROVED, STATUS.REJECTED].includes(query.status)) {
      filter.status = query.status;
    }

    if (query.search?.trim()) {
      const regex = new RegExp(query.search.trim(), "i");
      filter.$or = [
        { visitorName: regex },
        { mobileNumber: regex },
        { email: regex },
        { idNumber: regex },
      ];
    }

    const [items, total] = await Promise.all([
      JRAppointment.find(filter)
        .populate("review.reviewedBy", "name email")
        .populate("gateEntry.markedBy", "name email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      JRAppointment.countDocuments(filter),
    ]);

    return paginated(items.map(toAppointmentView), { page, limit, total });
  }

  async getAdminAppointmentById(user, appointmentId) {
    if (!isJRReviewer(user)) {
      return forbidden("Only Joint Registrar SA can access these appointments");
    }

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return badRequest("Invalid appointment id");
    }

    const appointment = await JRAppointment.findById(appointmentId)
      .populate("review.reviewedBy", "name email")
      .populate("gateEntry.markedBy", "name email");

    if (!appointment) {
      return notFound("JR appointment");
    }

    return success({ appointment: toAppointmentView(appointment) });
  }

  async reviewAppointment(user, appointmentId, payload = {}) {
    if (!isJRReviewer(user)) {
      return forbidden("Only Joint Registrar SA can review these appointments");
    }

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return badRequest("Invalid appointment id");
    }

    const action = payload.action?.trim()?.toLowerCase();
    if (!["approve", "reject"].includes(action)) {
      return badRequest("Action must be approve or reject");
    }

    const description = payload.description?.trim() || "";
    if (action === "reject" && !description) {
      return badRequest("Rejection description is required");
    }

    const appointment = await JRAppointment.findById(appointmentId);
    if (!appointment) {
      return notFound("JR appointment");
    }

    if (appointment.status !== STATUS.PENDING) {
      return badRequest("This appointment request is already reviewed");
    }

    if (action === "approve") {
      const approvedDate = parseDateOnly(payload.approvedDate);
      const approvedTime = payload.approvedTime?.trim();

      if (!approvedDate || !approvedTime) {
        return badRequest("Approved date and time are required for approval");
      }

      const today = startOfToday();
      if (approvedDate < today) {
        return badRequest("Approved meeting date cannot be in the past");
      }

      appointment.status = STATUS.APPROVED;
      appointment.approvedMeeting = {
        date: approvedDate,
        time: approvedTime,
      };
      appointment.review = {
        reviewedBy: user._id,
        reviewedAt: new Date(),
        action: "approve",
        description,
      };
    } else {
      appointment.status = STATUS.REJECTED;
      appointment.approvedMeeting = {
        date: null,
        time: "",
      };
      appointment.review = {
        reviewedBy: user._id,
        reviewedAt: new Date(),
        action: "reject",
        description,
      };
    }

    await appointment.save();

    const refreshed = await JRAppointment.findById(appointment._id)
      .populate("review.reviewedBy", "name email")
      .populate("gateEntry.markedBy", "name email");

    const approvedDateLabel = refreshed?.approvedMeeting?.date
      ? new Date(refreshed.approvedMeeting.date).toLocaleDateString("en-IN", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";

    const emailBody = buildDecisionEmailBody({
      appointment: refreshed,
      action,
      description,
      approvedDate: approvedDateLabel,
      approvedTime: refreshed?.approvedMeeting?.time || "",
    });

    const emailResult = await emailCustomService.sendCustomEmail({
      to: refreshed.email,
      subject:
        action === "approve"
          ? "JR Appointment Request Approved"
          : "JR Appointment Request Rejected",
      body: emailBody,
      sendType: "individual",
      sentBy: user,
    });

    return success({
      message: emailResult.success
        ? `Appointment request ${action}d and email sent`
        : `Appointment request ${action}d. Email delivery failed`,
      emailSent: Boolean(emailResult.success),
      appointment: toAppointmentView(refreshed),
    });
  }

  async getGateAppointments(user, query = {}) {
    if (!isGateUser(user)) {
      return forbidden("Only Hostel Gate can access this view");
    }

    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));

    const filter = {
      status: STATUS.APPROVED,
    };

    const dateFilter = query.dateFilter === "all" ? "all" : "today";
    if (dateFilter === "today") {
      const dayStart = startOfToday();
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      filter["approvedMeeting.date"] = {
        $gte: dayStart,
        $lt: dayEnd,
      };
    }

    if (query.entryStatus === "entered") {
      filter["gateEntry.entered"] = true;
    } else if (query.entryStatus === "pending") {
      filter["gateEntry.entered"] = false;
    }

    const [items, total] = await Promise.all([
      JRAppointment.find(filter)
        .populate("review.reviewedBy", "name email")
        .populate("gateEntry.markedBy", "name email")
        .sort({ "approvedMeeting.date": 1, "approvedMeeting.time": 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      JRAppointment.countDocuments(filter),
    ]);

    return paginated(items.map(toAppointmentView), { page, limit, total });
  }

  async markGateEntry(user, appointmentId, payload = {}) {
    if (!isGateUser(user)) {
      return forbidden("Only Hostel Gate can mark visitor entry");
    }

    if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
      return badRequest("Invalid appointment id");
    }

    const appointment = await JRAppointment.findById(appointmentId);
    if (!appointment) {
      return notFound("JR appointment");
    }

    if (appointment.status !== STATUS.APPROVED) {
      return badRequest("Only approved appointments can be marked as entered");
    }

    if (appointment.gateEntry?.entered) {
      return badRequest("Entry is already marked for this appointment");
    }

    appointment.gateEntry = {
      entered: true,
      enteredAt: new Date(),
      markedBy: user._id,
      note: payload.note?.trim() || "",
    };

    await appointment.save();

    const refreshed = await JRAppointment.findById(appointment._id)
      .populate("review.reviewedBy", "name email")
      .populate("gateEntry.markedBy", "name email");

    return success({
      message: "Visitor marked as entered",
      appointment: toAppointmentView(refreshed),
    });
  }
}

export const jrAppointmentsService = new JRAppointmentsService();
export default jrAppointmentsService;
