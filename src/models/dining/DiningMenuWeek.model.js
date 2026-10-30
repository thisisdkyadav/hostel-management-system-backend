import mongoose from "mongoose"

/**
 * Menu sub-documents shared by DiningMenuWeek and DiningMenuDay. Meal names
 * match the period's meal slots case-insensitively (trimmed).
 */
export const MenuItemSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true, minlength: 1, maxlength: 80 },
    diet: { type: String, enum: ["veg", "egg", "nonveg", ""], default: "" },
    special: { type: Boolean, default: false },
  },
  { _id: false }
)

export const MealMenuSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    items: {
      type: [MenuItemSchema],
      default: [],
      validate: { validator: (items) => items.length <= 40, message: "A meal can list at most 40 items" },
    },
    note: { type: String, trim: true, maxlength: 200, default: "" },
  },
  { _id: false }
)

/**
 * One version of a caterer's weekly menu. The menu for day D is the latest
 * version with effectiveFrom <= D (unless a DiningMenuDay overrides the meal),
 * so editing writes a new version and past days never change.
 */
const DiningMenuWeekSchema = new mongoose.Schema(
  {
    catererId: { type: mongoose.Schema.Types.ObjectId, ref: "Caterer", required: true },
    effectiveFrom: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    days: {
      type: [
        new mongoose.Schema(
          {
            weekday: { type: Number, min: 0, max: 6, required: true },
            meals: { type: [MealMenuSchema], default: [] },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    note: { type: String, trim: true, maxlength: 200, default: "" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
)

DiningMenuWeekSchema.index({ catererId: 1, effectiveFrom: 1 }, { unique: true })

const DiningMenuWeek = mongoose.model("DiningMenuWeek", DiningMenuWeekSchema)

export default DiningMenuWeek
