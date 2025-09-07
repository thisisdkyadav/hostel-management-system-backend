import mongoose from "mongoose"

const leaveSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  reason: { type: String, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  approvalInfo: { type: String },
  reasonForRejection: { type: String },
  approvalDate: { type: Date },
  approvalBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  joinDate: { type: Date },
  joinInfo: { type: String },
  joinStatus: { type: String, enum: ["Joined", "Not Joined"], default: "Not Joined" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

leaveSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

export default mongoose.model("Leave", leaveSchema)
