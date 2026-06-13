import mongoose from "mongoose"

/**
 * Dining Billing Account
 * A student's money pot for a single billing period. `allocatedAmount`
 * is admin-managed credit (mutated via CSV add/deduct/set ops, each logged
 * in `adjustments`). Daily dining charges are NOT stored here — they are
 * computed on read from the contained dining periods, the student's
 * allocations, and approved rebates. Balance = allocatedAmount - charges.
 */
const DiningBillingAccountSchema = new mongoose.Schema(
  {
    billingPeriodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiningBillingPeriod",
      required: true,
    },
    studentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    studentProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentProfile",
    },
    rollNumber: {
      type: String,
      trim: true,
      uppercase: true,
    },
    allocatedAmount: {
      type: Number,
      default: 0,
    },
    adjustments: {
      type: [
        {
          mode: {
            type: String,
            enum: ["add", "deduct", "set"],
            required: true,
          },
          amount: {
            type: Number,
            required: true,
          },
          allocatedAfter: {
            type: Number,
            required: true,
          },
          note: {
            type: String,
            trim: true,
            default: "",
          },
          performedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          performedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
)

DiningBillingAccountSchema.index({ billingPeriodId: 1, studentUserId: 1 }, { unique: true })
DiningBillingAccountSchema.index({ billingPeriodId: 1, rollNumber: 1 })

DiningBillingAccountSchema.virtual("id").get(function () {
  return this._id
})

DiningBillingAccountSchema.set("toJSON", { virtuals: true })

const DiningBillingAccount = mongoose.model("DiningBillingAccount", DiningBillingAccountSchema)

export default DiningBillingAccount
