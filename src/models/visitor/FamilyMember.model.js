/**
 * Family Member Model
 * Student family member contacts
 */

import mongoose from "mongoose"

const FamilyMemberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  name: {
    type: String,
    required: true,
  },
  relationship: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  email: {
    type: String,
  },
  address: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

FamilyMemberSchema.virtual("id").get(function () {
  return this._id
})

FamilyMemberSchema.set("toJSON", { virtuals: true })

const FamilyMember = mongoose.model("FamilyMember", FamilyMemberSchema)

export default FamilyMember
