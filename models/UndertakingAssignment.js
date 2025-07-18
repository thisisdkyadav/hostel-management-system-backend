import mongoose from "mongoose"

const undertakingAssignmentSchema = new mongoose.Schema(
  {
    undertakingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Undertaking",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    status: {
      type: String,
      enum: ["accepted", "pending", "not_viewed"],
      default: "not_viewed",
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    acceptedAt: {
      type: Date,
    },
    viewedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
)

// Create a compound index to ensure a student can only be assigned to an undertaking once
undertakingAssignmentSchema.index({ undertakingId: 1, studentId: 1 }, { unique: true })

const UndertakingAssignment = mongoose.model("UndertakingAssignment", undertakingAssignmentSchema)
export default UndertakingAssignment
