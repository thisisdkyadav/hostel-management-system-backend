import mongoose from "mongoose"

/**
 * Dining Billing Period
 * Groups one or more dining periods ("timing periods") into a single
 * billing window. Each student gets a per-billing-period money pot
 * (see DiningBillingAccount); daily dining charges are derived on read.
 * The effective date range is derived from the contained dining periods.
 */
const DiningBillingPeriodSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    diningPeriodIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "DiningPeriod",
      default: [],
    },
    note: {
      type: String,
      trim: true,
      default: "",
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

DiningBillingPeriodSchema.index({ isArchived: 1, createdAt: -1 })
DiningBillingPeriodSchema.index({ diningPeriodIds: 1 })

DiningBillingPeriodSchema.virtual("id").get(function () {
  return this._id
})

DiningBillingPeriodSchema.set("toJSON", { virtuals: true })

const DiningBillingPeriod = mongoose.model("DiningBillingPeriod", DiningBillingPeriodSchema)

export default DiningBillingPeriod
