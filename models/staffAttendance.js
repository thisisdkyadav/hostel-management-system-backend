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

const StaffAttendance = mongoose.model("StaffAttendance", staffAttendanceSchema)

export default StaffAttendance
