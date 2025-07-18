import mongoose from "mongoose"

const undertakingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    deadline: {
      type: Date,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "expired"],
      default: "active",
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  }
)

undertakingSchema.virtual("totalStudents", {
  ref: "UndertakingAssignment",
  localField: "_id",
  foreignField: "undertakingId",
  count: true,
})

undertakingSchema.virtual("acceptedCount", {
  ref: "UndertakingAssignment",
  localField: "_id",
  foreignField: "undertakingId",
  count: true,
  match: { status: "accepted" },
})

const Undertaking = mongoose.model("Undertaking", undertakingSchema)
export default Undertaking
