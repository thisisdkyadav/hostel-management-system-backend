import mongoose from "mongoose"

const APPROVER_ASSIGNMENT_SCHEMA = new mongoose.Schema(
  {
    stage: {
      type: String,
      enum: ["Officer SA", "Associate Dean SA", "Dean SA"],
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { _id: false }
)

const PorRequestSchema = new mongoose.Schema(
  {
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      index: true,
    },
    gymkhanaCategoryKey: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    hasDisciplinaryAction: {
      type: Boolean,
      default: false,
    },
    disciplinaryActionDetails: {
      type: String,
      trim: true,
      default: "",
    },
    positionTitle: {
      type: String,
      required: true,
      trim: true,
    },
    positionDetails: {
      type: String,
      required: true,
      trim: true,
    },
    tenure: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: [
        "pending_club",
        "pending_gs",
        "pending_president",
        "pending_student_affairs",
        "pending_joint_registrar",
        "pending_associate_dean",
        "pending_dean",
        "approved",
        "rejected",
        "revision_requested",
      ],
      default: "pending_club",
      index: true,
    },
    currentApprovalStage: {
      type: String,
      enum: [
        "Student",
        "Club",
        "GS Gymkhana",
        "President Gymkhana",
        "Student Affairs",
        "Officer SA",
        "Associate Dean SA",
        "Dean SA",
      ],
      default: "Club",
    },
    customApprovalChain: [
      {
        type: String,
        enum: ["Officer SA", "Associate Dean SA", "Dean SA"],
      },
    ],
    currentChainIndex: {
      type: Number,
      default: null,
    },
    customApprovalAssignments: {
      type: [APPROVER_ASSIGNMENT_SCHEMA],
      default: [],
    },
    currentApproverUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectionReason: {
      type: String,
      trim: true,
      default: null,
    },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    rejectedAt: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    revisionCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

PorRequestSchema.index({ submittedBy: 1, createdAt: -1 })
PorRequestSchema.index({ clubId: 1, createdAt: -1 })
PorRequestSchema.index({ gymkhanaCategoryKey: 1, createdAt: -1 })

const PorRequest = mongoose.model("PorRequest", PorRequestSchema)

export default PorRequest
