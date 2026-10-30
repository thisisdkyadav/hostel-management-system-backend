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
    // Student self-registration window. Optional: when registrationEnabled is
    // false the period has no self-registration and these stay null — the admin
    // assigns caterers manually from the Manage Students surface instead.
    registrationEnabled: {
      type: Boolean,
      default: true,
    },
    allocationStartAt: {
      type: Date,
      default: null,
    },
    allocationEndAt: {
      type: Date,
      default: null,
    },
    // Scheduled one-shot email to eligible students announcing the
    // registration window. notificationSentAt is set when the job claims it.
    notificationAt: {
      type: Date,
      default: null,
    },
    notificationSentAt: {
      type: Date,
      default: null,
    },
    // Scheduled auto-allocation: at this instant every eligible student who has
    // not chosen a caterer is assigned to one with free seats. null = never.
    // autoAllocation.status is null until the job claims the period; it doubles
    // as the claim marker (running) and the run report (completed/failed).
    autoAllocationAt: {
      type: Date,
      default: null,
    },
    autoAllocation: {
      type: new mongoose.Schema(
        {
          status: { type: String, enum: ["running", "completed", "failed"], default: null },
          startedAt: { type: Date, default: null },
          completedAt: { type: Date, default: null },
          unallocatedBefore: { type: Number, default: 0 },
          assigned: { type: Number, default: 0 },
          leftOver: { type: Number, default: 0 },
          byCaterer: {
            type: [
              new mongoose.Schema(
                {
                  catererId: { type: mongoose.Schema.Types.ObjectId, ref: "Caterer" },
                  assigned: { type: Number, default: 0 },
                },
                { _id: false }
              ),
            ],
            default: [],
          },
          error: { type: String, default: null },
        },
        { _id: false }
      ),
      default: null,
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
    // Per-day meal timing overrides on top of mealSlots (see services/dining/mealSchedule.js).
    weekSchedule: {
      type: [
        {
          weekday: { type: Number, min: 0, max: 6, required: true },
          slots: [{ _id: false, name: String, startTime: String, endTime: String, closed: { type: Boolean, default: false } }],
        },
      ],
      default: [],
    },
    dateSchedule: {
      type: [
        {
          date: { type: String, required: true },
          slots: [{ _id: false, name: String, startTime: String, endTime: String, closed: { type: Boolean, default: false } }],
        },
      ],
      default: [],
    },
    dailyRate: {
      type: Number,
      default: 0,
      min: 0,
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
DiningPeriodSchema.index({ notificationAt: 1, notificationSentAt: 1 })
DiningPeriodSchema.index({ autoAllocationAt: 1, "autoAllocation.status": 1 })

DiningPeriodSchema.virtual("id").get(function () {
  return this._id
})

DiningPeriodSchema.set("toJSON", { virtuals: true })

const DiningPeriod = mongoose.model("DiningPeriod", DiningPeriodSchema)

export default DiningPeriod
