import mongoose from "mongoose"

const DiningPeriodSchema = new mongoose.Schema(
  {
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    catererIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Caterer",
      default: [],
    },
    eligibilityMode: {
      type: String,
      enum: ["all-active", "custom"],
      default: "all-active",
      required: true,
    },
    eligibleRollNumbers: {
      type: [String],
      default: [],
    },
    eligibleStudentCount: {
      type: Number,
      default: 0,
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

DiningPeriodSchema.index({ isArchived: 1, startDate: -1 })
DiningPeriodSchema.index({ catererIds: 1 })
DiningPeriodSchema.index({ eligibilityMode: 1 })

DiningPeriodSchema.virtual("id").get(function () {
  return this._id
})

DiningPeriodSchema.set("toJSON", { virtuals: true })

const DiningPeriod = mongoose.model("DiningPeriod", DiningPeriodSchema)

export default DiningPeriod
