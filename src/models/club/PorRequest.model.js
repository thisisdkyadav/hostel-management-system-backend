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

const GYMKHANA_STEP_SNAPSHOT_SCHEMA = new mongoose.Schema(
  {
    label: {
      type: String,
      required: true,
      trim: true,
    },
    reviewerUserIds: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
      ],
      default: [],
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
      default: null,
      index: true,
    },
    porCategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PorCategory",
      default: null,
      index: true,
    },
    porCategoryNameSnapshot: {
      type: String,
      trim: true,
      default: "",
    },
    gymkhanaCategoryKey: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    gymkhanaApprovalSteps: {
      type: [GYMKHANA_STEP_SNAPSHOT_SCHEMA],
      default: [],
    },
    currentGymkhanaStepIndex: {
      type: Number,
      default: null,
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
    supportingDocumentUrl: {
      type: String,
      trim: true,
      default: "",
    },
    supportingDocumentName: {
      type: String,
      trim: true,
      default: "",
    },
    undertakingAccepted: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: [
        "pending_gymkhana",
        "pending_club",
        "pending_gs",
        "pending_president",
        "pending_student_affairs",
        "pending_officer",
        "pending_associate_dean",
        "pending_dean",
        "approved",
        "rejected",
        "revision_requested",
      ],
      default: "pending_gymkhana",
      index: true,
    },
    currentApprovalStage: {
      type: String,
      default: null,
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
    currentApproverUsers: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      default: [],
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
PorRequestSchema.index({ porCategoryId: 1, createdAt: -1 })
PorRequestSchema.index({ currentApproverUsers: 1, updatedAt: -1 })

const PorRequest = mongoose.model("PorRequest", PorRequestSchema)

export default PorRequest
