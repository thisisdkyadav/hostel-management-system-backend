import mongoose from "mongoose"
import VisitorProfile from "./VisitorProfile.js" // added import

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
  hostelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hostel",
  },
  allocatedRooms: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: "Room",
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
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

const VisitorRequest = mongoose.model("VisitorRequest", visitorRequestSchema)
export default VisitorRequest
