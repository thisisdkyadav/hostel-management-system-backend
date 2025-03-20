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
  dateAndTime: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["checkedIn", "checkedOut"],
    required: true,
  },
})

const CheckInOut = mongoose.model("CheckInOut", checkInOutSchema)
export default CheckInOut
