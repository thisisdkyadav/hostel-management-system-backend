/**
 * Visitor Profile Model
 * Student's registered visitors
 */

import mongoose from "mongoose"

const VisitorProfileSchema = new mongoose.Schema({
  studentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true },
  relation: { type: String, required: true },
  address: { type: String },
  requests: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VisitorRequest",
    },
  ],
})

VisitorProfileSchema.index({ studentUserId: 1 })

VisitorProfileSchema.pre(["findOneAndDelete", "findOneAndUpdate"], async function (next) {
  const docToModify = await this.model.findOne(this.getQuery())
  if (docToModify && docToModify.requests && docToModify.requests.length > 0) {
    return next(new Error("Cannot delete or update visitor profile with previous requests."))
  }
  next()
})

const VisitorProfile = mongoose.model("VisitorProfile", VisitorProfileSchema)
export default VisitorProfile
