import mongoose from "mongoose"

const feedbackSchema = new mongoose.Schema({
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
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["Seen", "Pending"],
    default: "Pending",
  },
  reply: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

const Feedback = mongoose.model("Feedback", feedbackSchema)
export default Feedback
