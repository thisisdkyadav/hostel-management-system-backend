import mongoose from "mongoose"

// Filled long-term rebate form uploaded by the student (storage policy dining-rebate-forms).
const DiningRebateFormSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true, trim: true },
    name: { type: String, trim: true, default: "" },
    uploadedAt: { type: Date, default: null },
  },
  { _id: false }
)

const DiningRebateSchema = new mongoose.Schema(
  {
    requestGroupId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    // LEGACY: rebates are standalone date ranges now. New rows leave these null;
    // old rows keep them but nothing reads them. Attribution to a period/caterer
    // is derived from the student's allocation (services/dining/rebateScope.js).
    periodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiningPeriod",
      default: null,
    },
    catererId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Caterer",
      default: null,
    },
    studentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    studentProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    dateKeys: {
      type: [String],
      required: true,
      default: [],
    },
    dayCount: {
      type: Number,
      required: true,
      min: 1,
    },
    type: {
      type: String,
      enum: ["short-term", "long-term"],
      required: true,
    },
    status: {
      type: String,
      enum: ["approved", "pending", "rejected"],
      required: true,
      default: "pending",
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    adminComment: {
      type: String,
      trim: true,
      default: "",
    },
    form: {
      type: DiningRebateFormSchema,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

DiningRebateSchema.index({ studentUserId: 1, periodId: 1, status: 1 })
DiningRebateSchema.index({ periodId: 1, catererId: 1, status: 1 })
DiningRebateSchema.index({ dateKeys: 1, status: 1 })
DiningRebateSchema.index({ studentUserId: 1, status: 1, dateKeys: 1 })
DiningRebateSchema.index({ status: 1, createdAt: -1 })

DiningRebateSchema.virtual("id").get(function () {
  return this._id
})

DiningRebateSchema.set("toJSON", { virtuals: true })

const DiningRebate = mongoose.model("DiningRebate", DiningRebateSchema)

export default DiningRebate
