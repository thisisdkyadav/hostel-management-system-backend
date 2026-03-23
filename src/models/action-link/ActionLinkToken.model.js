import mongoose from "mongoose"

const ActionLinkTokenSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    tokenCiphertext: {
      type: String,
      default: "",
    },
    subjectModel: {
      type: String,
      trim: true,
      required: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    recipientUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    recipientEmail: {
      type: String,
      trim: true,
      default: "",
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    responsePayload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    invalidatedAt: {
      type: Date,
      default: null,
    },
    invalidationReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    timestamps: true,
  }
)

ActionLinkTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 })
ActionLinkTokenSchema.index({ type: 1, subjectModel: 1, subjectId: 1 })

const ActionLinkToken = mongoose.model("ActionLinkToken", ActionLinkTokenSchema)

export default ActionLinkToken
