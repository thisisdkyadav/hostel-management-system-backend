/**
 * CheckInOut Model
 * Student check-in/out tracking
 */

import mongoose from "mongoose"

const checkInOutSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  hostelId: {
    // gate hostel id
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hostel",
    required: true,
  },
  hostelName: {
    // user hostel name
    type: String,
    required: true,
  },
  room: {
    // user room number
    type: String,
    required: true,
  },
  unit: {
    // user unit number
    type: String,
    // required: true,
  },
  bed: {
    // user bed number
    type: String,
    required: true,
  },
  dateAndTime: {
    type: Date,
    default: Date.now,
  },
  isSameHostel: {
    type: Boolean,
    required: true,
  },
  reason: {
    type: String,
    required: false,
  },
  status: {
    type: String,
    enum: ["Checked In", "Checked Out"],
    required: true,
  },
})

// Query patterns: latest user entry, hostel feeds, live status/date filters, and cross-hostel stats.
checkInOutSchema.index({ userId: 1, dateAndTime: -1 })
checkInOutSchema.index({ hostelId: 1, dateAndTime: -1 })
checkInOutSchema.index({ hostelId: 1, status: 1, dateAndTime: -1 })
checkInOutSchema.index({ status: 1, dateAndTime: -1 })
checkInOutSchema.index({ isSameHostel: 1, dateAndTime: -1 })
checkInOutSchema.index({ dateAndTime: -1 })

const CheckInOut = mongoose.model("CheckInOut", checkInOutSchema)
export default CheckInOut
