/**
 * Visitor Request Model
 * Visitor stay requests from students
 */

import mongoose from "mongoose"
import VisitorProfile from "./VisitorProfile.model.js"

const visitorRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  visitors: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VisitorProfile",
    },
  ],
  reason: {
    type: String,
    required: true,
  },
  fromDate: {
    type: Date,
    required: true,
  },
  toDate: {
    type: Date,
    required: true,
  },
  h2FormUrl: {
    type: String,
  },
  hostelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hostel",
  },
  allocatedRooms: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Room",
  },
  paymentInfo: {
    amount: {
      type: Number,
    },
    dateOfPayment: {
      type: Date,
    },
    transactionId: {
      type: String,
    },
    screenshot: {
      type: String,
    },
    additionalInfo: {
      type: String,
    },
  },
  paymentLink: {
    type: String,
  },
  paymentId: {
    type: String,
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },
  approveInfo: {
    type: String,
  },
  reasonForRejection: {
    type: String,
  },
  checkInTime: {
    type: Date,
  },
  checkOutTime: {
    type: Date,
  },
  securityNotes: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

visitorRequestSchema.pre("findOneAndDelete", async function (next) {
  const doc = await this.model.findOne(this.getFilter())
  if (doc && doc.status !== "Pending") {
    return next(new Error("Cannot delete a request that is not pending"))
  }
  next()
})

visitorRequestSchema.post("save", async function (doc, next) {
  if (doc.visitors && doc.visitors.length) {
    await VisitorProfile.updateMany({ _id: { $in: doc.visitors } }, { $addToSet: { requests: doc._id } })
  }
  next()
})

visitorRequestSchema.post("findOneAndDelete", async function (doc, next) {
  if (doc && doc.visitors && doc.visitors.length) {
    await VisitorProfile.updateMany({ _id: { $in: doc.visitors } }, { $pull: { requests: doc._id } })
  }
  next()
})

visitorRequestSchema.index({ userId: 1, createdAt: -1 })
visitorRequestSchema.index({ hostelId: 1, status: 1, createdAt: -1 })

const VisitorRequest = mongoose.model("VisitorRequest", visitorRequestSchema)
export default VisitorRequest
