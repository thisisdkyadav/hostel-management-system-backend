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
  //   targets: {
  //     hostelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hostel" }],
  //     departments: [{ type: String }],
  //     degrees: [{ type: String }],
  //     admissionYearStart: { type: Number },
  //     admissionYearEnd: { type: Number },
  //     specific: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  //   },
  targetType: {
    type: String,
    enum: ["all", "hostel", "department", "degree", "admission_year", "specific"],
    default: "all",
  },
  status: {
    type: String,
    enum: ["draft", "sent", "cancelled"],
    default: "draft",
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
