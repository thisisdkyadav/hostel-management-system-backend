import mongoose from "mongoose"
import { MealMenuSchema } from "./DiningMenuWeek.model.js"

/**
 * Per-date menu overrides of one caterer. Each meal present here replaces that
 * meal of the weekly menu on `date`, even with no items ("nothing listed").
 * Resetting a meal removes it; a document with no meals left is deleted.
 */
const DiningMenuDaySchema = new mongoose.Schema(
  {
    catererId: { type: mongoose.Schema.Types.ObjectId, ref: "Caterer", required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    meals: { type: [MealMenuSchema], default: [] },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
)

DiningMenuDaySchema.index({ catererId: 1, date: 1 }, { unique: true })

const DiningMenuDay = mongoose.model("DiningMenuDay", DiningMenuDaySchema)

export default DiningMenuDay
