/**
 * JR Appointment Model
 * Public visitor appointment requests for meeting Joint Registrar SA.
 */

import mongoose from "mongoose";

const JRAppointmentSchema = new mongoose.Schema(
  {
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

JRAppointmentSchema.index({ status: 1, preferredDate: 1, createdAt: -1 });
JRAppointmentSchema.index({ "approvedMeeting.date": 1, status: 1 });

const JRAppointment = mongoose.model("JRAppointment", JRAppointmentSchema);

export default JRAppointment;
