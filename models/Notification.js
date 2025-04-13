import mongoose from "mongoose"

const NotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["announcement"],
    default: "announcement",
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  hostelId: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hostel",
    },
  ],
  degree: [
    {
      type: String,
    },
  ],
  department: [
    {
      type: String,
    },
  ],
  gender: {
    type: String,
    enum: ["Male", "Female", "Other"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiryDate: {
    type: Date,
    default: function () {
      const date = new Date()
      date.setDate(date.getDate() + 15)
      return date
    },
  },
})

NotificationSchema.index({ createdAt: -1 })
NotificationSchema.index({ expiryDate: 1 })

const Notification = mongoose.model("Notification", NotificationSchema)
export default Notification
