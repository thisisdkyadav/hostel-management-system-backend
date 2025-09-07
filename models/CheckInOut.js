import mongoose from "mongoose"

const checkInOutSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  hostelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hostel",
    required: true,
  },
  room: {
    type: String,
    required: true,
  },
  unit: {
    type: String,
    required: true,
  },
  bed: {
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

const CheckInOut = mongoose.model("CheckInOut", checkInOutSchema)
export default CheckInOut
