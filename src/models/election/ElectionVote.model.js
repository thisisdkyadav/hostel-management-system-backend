import mongoose from "mongoose"

const ElectionVoteSchema = new mongoose.Schema(
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
    voterUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    voterRollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    candidateNominationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ElectionNomination",
      default: null,
    },
    candidateUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    candidateRollNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    isNota: {
      type: Boolean,
      default: false,
    },
    castAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
)

ElectionVoteSchema.index({ electionId: 1, postId: 1, voterUserId: 1 }, { unique: true })

const ElectionVote = mongoose.model("ElectionVote", ElectionVoteSchema)

export default ElectionVote
