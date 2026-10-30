import mongoose from "mongoose"

/**
 * A yes/no dining attribute of a student (e.g. "Jain food").
 * - kind "period": defined on a dining period, asked when the student picks a
 *   caterer, applies to the whole period. defaultValue covers students who never
 *   answered (auto-allocated or placed by the office).
 * - kind "standalone": made on the Tags page, applies on its own calendar days
 *   (startDate..endDate, may span periods), optionally collected through a form
 *   on the student dining page during its own window, for an audience.
 * Answers live in DiningTagValue; effective value = answer ?? defaultValue.
 */
const DiningTagSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["period", "standalone"], required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    // The yes/no question students see; falls back to the name.
    question: { type: String, trim: true, default: "", maxlength: 200 },
    description: { type: String, trim: true, default: "", maxlength: 1000 },
    periodId: { type: mongoose.Schema.Types.ObjectId, ref: "DiningPeriod", default: null },
    // Calendar days stored as UTC midnight, like DiningPeriod. Standalone only.
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    defaultValue: { type: Boolean, default: null },
    form: {
      enabled: { type: Boolean, default: false },
      opensAt: { type: Date, default: null },
      closesAt: { type: Date, default: null },
      audience: { type: String, enum: ["all-active", "custom"], default: "all-active" },
      rollNumbers: { type: [String], default: [] },
    },
    order: { type: Number, default: 0 },
    isArchived: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
)

DiningTagSchema.index({ kind: 1, periodId: 1, isArchived: 1 })
DiningTagSchema.index({ kind: 1, isArchived: 1, startDate: 1, endDate: 1 })
DiningTagSchema.index({ "form.enabled": 1, "form.opensAt": 1, "form.closesAt": 1 })

DiningTagSchema.virtual("id").get(function () {
  return this._id
})
DiningTagSchema.set("toJSON", { virtuals: true })

const DiningTag = mongoose.model("DiningTag", DiningTagSchema)

export default DiningTag
