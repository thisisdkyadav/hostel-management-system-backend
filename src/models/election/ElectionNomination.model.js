import mongoose from "mongoose"

const ElectionAttachmentSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      required: true,
    },
    url: {
      type: String,
      trim: true,
      required: true,
    },
  },
  { _id: false }
)

const ElectionNominationReviewSchema = new mongoose.Schema(
  {
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
)

const ElectionNominationSchema = new mongoose.Schema(
  {
    electionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Election",
      required: true,
      index: true,
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    postTitle: {
      type: String,
      trim: true,
      required: true,
    },
    candidateUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    candidateProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentProfile",
      required: true,
    },
    candidateRollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    candidateBatch: {
      type: String,
      trim: true,
      default: "",
    },
    pitch: {
      type: String,
      trim: true,
      default: "",
    },
    agendaPoints: {
      type: [String],
      default: [],
    },
    cgpa: {
      type: Number,
      default: null,
    },
    completedSemesters: {
      type: Number,
      default: null,
    },
    remainingSemesters: {
      type: Number,
      default: null,
    },
    proposerUserIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    seconderUserIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    proposerRollNumbers: {
      type: [String],
      default: [],
    },
    seconderRollNumbers: {
      type: [String],
      default: [],
    },
    gradeCardUrl: {
      type: String,
      trim: true,
      default: "",
    },
    identityCardUrl: {
      type: String,
      trim: true,
      default: "",
    },
    manifestoUrl: {
      type: String,
      trim: true,
      default: "",
    },
    porDocumentUrl: {
      type: String,
      trim: true,
      default: "",
    },
    attachments: {
      type: [ElectionAttachmentSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["submitted", "verified", "modification_requested", "rejected", "withdrawn"],
      default: "submitted",
      index: true,
    },
    review: {
      type: ElectionNominationReviewSchema,
      default: () => ({}),
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    withdrawnAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
)

ElectionNominationSchema.index({ electionId: 1, postId: 1, candidateUserId: 1 }, { unique: true })
ElectionNominationSchema.index({ electionId: 1, status: 1, candidateUserId: 1 })

const ElectionNomination = mongoose.model("ElectionNomination", ElectionNominationSchema)

export default ElectionNomination
