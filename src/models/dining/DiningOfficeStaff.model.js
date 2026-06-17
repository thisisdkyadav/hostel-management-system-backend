import mongoose from "mongoose"

import { DINING_OFFICE_CATEGORIES } from "../../core/constants/roles.constants.js"

/**
 * Dining Office Staff
 * Profile record for a Dining-role / Office sub-role login. Distinct from the
 * Caterer (vendor) entity. `category` is the office designation.
 */
const DiningOfficeStaffSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    category: {
      type: String,
      enum: DINING_OFFICE_CATEGORIES,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    joinDate: {
      type: Date,
      default: Date.now,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

DiningOfficeStaffSchema.index({ isArchived: 1, category: 1 })

DiningOfficeStaffSchema.virtual("id").get(function () {
  return this._id
})

DiningOfficeStaffSchema.set("toJSON", { virtuals: true })

const DiningOfficeStaff = mongoose.model("DiningOfficeStaff", DiningOfficeStaffSchema)

export default DiningOfficeStaff
