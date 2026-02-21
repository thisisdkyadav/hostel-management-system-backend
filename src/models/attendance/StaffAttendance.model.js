/**
 * Staff Attendance Model
 * Staff check-in/out tracking
 */

import mongoose from "mongoose"

const staffAttendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
  type: {
    type: String,
    enum: ["checkIn", "checkOut"],
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

staffAttendanceSchema.index({ userId: 1, createdAt: -1 })
staffAttendanceSchema.index({ hostelId: 1, createdAt: -1 })
staffAttendanceSchema.index({ createdAt: -1 })

const StaffAttendance = mongoose.model("StaffAttendance", staffAttendanceSchema)

export default StaffAttendance
