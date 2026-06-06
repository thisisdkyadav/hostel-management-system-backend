import mongoose from "mongoose"

const DiningAllocationSchema = new mongoose.Schema(
  {
    periodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiningPeriod",
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
      required: true,
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    catererId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Caterer",
      required: true,
    },
    selectedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
)

DiningAllocationSchema.index({ periodId: 1, studentUserId: 1 }, { unique: true })
DiningAllocationSchema.index({ periodId: 1, catererId: 1 })
DiningAllocationSchema.index({ rollNumber: 1, periodId: 1 })

DiningAllocationSchema.virtual("id").get(function () {
  return this._id
})

DiningAllocationSchema.set("toJSON", { virtuals: true })

const DiningAllocation = mongoose.model("DiningAllocation", DiningAllocationSchema)

export default DiningAllocation
