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
    allocationStartAt: {
      type: Date,
      required: true,
    },
    allocationEndAt: {
      type: Date,
      required: true,
    },
    catererIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "Caterer",
      default: [],
    },
    catererCapacities: {
      type: [
        {
          catererId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Caterer",
            required: true,
          },
          maxStudentCount: {
            type: Number,
            required: true,
            min: 1,
          },
          allocatedCount: {
            type: Number,
            default: 0,
            min: 0,
          },
        },
      ],
      default: [],
    },
    mealSlots: {
      type: [
        {
          name: {
            type: String,
            required: true,
            trim: true,
          },
          startTime: {
            type: String,
            required: true,
            trim: true,
          },
          endTime: {
            type: String,
            required: true,
            trim: true,
          },
        },
      ],
      default: [
        { name: "Breakfast", startTime: "07:00", endTime: "10:00" },
        { name: "Lunch", startTime: "12:00", endTime: "15:00" },
        { name: "Dinner", startTime: "19:00", endTime: "22:00" },
      ],
    },
    rebateSettings: {
      shortTermMaxTotalDays: {
        type: Number,
        default: 10,
        min: 0,
      },
      shortTermMaxContinuousDays: {
        type: Number,
        default: 3,
        min: 1,
      },
      shortTermMinApplicationDays: {
        type: Number,
        default: 1,
        min: 1,
      },
      shortTermMinAdvanceDays: {
        type: Number,
        default: 2,
        min: 0,
      },
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
DiningPeriodSchema.index({ allocationStartAt: 1, allocationEndAt: 1, isArchived: 1 })
DiningPeriodSchema.index({ eligibilityMode: 1 })

DiningPeriodSchema.virtual("id").get(function () {
  return this._id
})

DiningPeriodSchema.set("toJSON", { virtuals: true })

const DiningPeriod = mongoose.model("DiningPeriod", DiningPeriodSchema)

export default DiningPeriod
