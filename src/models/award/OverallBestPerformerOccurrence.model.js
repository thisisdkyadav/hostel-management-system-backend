import mongoose from "mongoose"

const OverallBestPerformerOccurrenceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    awardYear: {
      type: Number,
      required: true,
      min: 2000,
      max: 3000,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    applyEndAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "closed"],
      default: "active",
    },
    eligibleRollNumbers: {
      type: [String],
      default: [],
    },
    eligibleStudentCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activatedAt: {
      type: Date,
      default: Date.now,
    },
    closedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

OverallBestPerformerOccurrenceSchema.index({ status: 1, applyEndAt: -1 })
OverallBestPerformerOccurrenceSchema.index({ awardYear: -1 })

const OverallBestPerformerOccurrence = mongoose.model(
  "OverallBestPerformerOccurrence",
  OverallBestPerformerOccurrenceSchema
)

export default OverallBestPerformerOccurrence
