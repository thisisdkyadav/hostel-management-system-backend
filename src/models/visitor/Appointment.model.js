/**
 * Appointment Model
 * Public visitor appointment requests for meeting designated Admin officials.
 */

import mongoose from "mongoose";

const AppointmentSchema = new mongoose.Schema(
  {
    targetAdminUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetSubRole: {
      type: String,
      enum: ["Joint Registrar SA", "Associate Dean SA", "Dean SA"],
      required: true,
    },
    visitorName: {
      type: String,
      required: true,
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    idType: {
      type: String,
      enum: ["Aadhaar", "PAN"],
      required: true,
    },
    idNumber: {
      type: String,
      required: true,
      trim: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    preferredDate: {
      type: Date,
      required: true,
    },
    preferredTime: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    review: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      reviewedAt: { type: Date, default: null },
      action: { type: String, enum: ["approve", "reject", null], default: null },
      description: { type: String, default: "", trim: true },
    },
    approvedMeeting: {
      date: { type: Date, default: null },
      time: { type: String, default: "", trim: true },
    },
    gateEntry: {
      entered: { type: Boolean, default: false },
      enteredAt: { type: Date, default: null },
      markedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      note: { type: String, default: "", trim: true },
    },
  },
  {
    timestamps: true,
  }
);

AppointmentSchema.index({ status: 1, preferredDate: 1, createdAt: -1 });
AppointmentSchema.index({ "approvedMeeting.date": 1, status: 1 });
AppointmentSchema.index({ targetAdminUserId: 1, status: 1, createdAt: -1 });
AppointmentSchema.index({ targetSubRole: 1, status: 1, createdAt: -1 });
AppointmentSchema.index({ status: 1, "approvedMeeting.date": 1, "approvedMeeting.time": 1, createdAt: -1 });
AppointmentSchema.index({ status: 1, "gateEntry.entered": 1, "approvedMeeting.date": 1 });

const Appointment = mongoose.model("JRAppointment", AppointmentSchema);

export default Appointment;
