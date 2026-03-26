import mongoose from "mongoose"

const EligibilityScopeSchema = new mongoose.Schema(
  {
    batches: {
      type: [String],
      default: [],
    },
    groups: {
      type: [String],
      default: [],
    },
    extraRollNumbers: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
)

const ElectionCommissionSchema = new mongoose.Schema(
  {
    chiefElectionOfficerRollNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    officerRollNumbers: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
)

const ElectionPostRequirementsSchema = new mongoose.Schema(
  {
    minCgpa: {
      type: Number,
      default: 6,
    },
    minCompletedSemestersUg: {
      type: Number,
      default: 0,
    },
    minCompletedSemestersPg: {
      type: Number,
      default: 0,
    },
    minRemainingSemesters: {
      type: Number,
      default: 0,
    },
    proposersRequired: {
      type: Number,
      default: 1,
    },
    secondersRequired: {
      type: Number,
      default: 1,
    },
    requireElectorateMembership: {
      type: Boolean,
      default: false,
    },
    requireHostelResident: {
      type: Boolean,
      default: false,
    },
    allowedHostelNames: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
)

const ElectionPostSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    category: {
      type: String,
      enum: ["executive", "senator", "horc", "custom"],
      default: "custom",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    candidateEligibility: {
      type: EligibilityScopeSchema,
      default: () => ({}),
    },
    voterEligibility: {
      type: EligibilityScopeSchema,
      default: () => ({}),
    },
    requirements: {
      type: ElectionPostRequirementsSchema,
      default: () => ({}),
    },
  },
  { _id: true }
)

const ElectionTimelineSchema = new mongoose.Schema(
  {
    announcementAt: { type: Date, required: true },
    nominationStartAt: { type: Date, required: true },
    nominationEndAt: { type: Date, required: true },
    withdrawalEndAt: { type: Date, required: true },
    campaigningStartAt: { type: Date, required: true },
    campaigningEndAt: { type: Date, required: true },
    votingStartAt: { type: Date, required: true },
    votingEndAt: { type: Date, required: true },
    resultsAnnouncedAt: { type: Date, required: true },
    handoverAt: { type: Date, default: null },
  },
  { _id: false }
)

const ElectionVotingAccessSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["email", "portal", "both"],
      default: "both",
    },
  },
  { _id: false }
)

const ElectionMockSettingsSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    voterRollNumbers: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
)

const ElectionResultPostSchema = new mongoose.Schema(
  {
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    winnerNominationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ElectionNomination",
      default: null,
    },
    winnerNominationIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "ElectionNomination",
      default: [],
    },
    winnerIsNota: {
      type: Boolean,
      default: false,
    },
    winnerIsTie: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false }
)

const ElectionResultPublicationSchema = new mongoose.Schema(
  {
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: {
      type: Date,
      default: null,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    posts: {
      type: [ElectionResultPostSchema],
      default: [],
    },
  },
  { _id: false }
)

const ElectionVotingEmailDispatchSchema = new mongoose.Schema(
  {
    dispatchKey: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["idle", "queued", "running", "completed", "failed"],
      default: "idle",
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    lastTriggeredAt: {
      type: Date,
      default: null,
    },
    totalRecipients: {
      type: Number,
      default: 0,
    },
    sentRecipients: {
      type: Number,
      default: 0,
    },
    failedRecipients: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      trim: true,
      default: "",
    },
    recipientStatuses: {
      type: [
        new mongoose.Schema(
          {
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
              default: null,
            },
            name: {
              type: String,
              trim: true,
              default: "",
            },
            email: {
              type: String,
              trim: true,
              default: "",
            },
            rollNumber: {
              type: String,
              trim: true,
              uppercase: true,
              default: "",
            },
            status: {
              type: String,
              enum: ["pending", "sent", "failed"],
              default: "pending",
            },
            sentAt: {
              type: Date,
              default: null,
            },
            lastError: {
              type: String,
              trim: true,
              default: "",
            },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
  },
  { _id: false }
)

const ElectionSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    academicYear: {
      type: String,
      required: true,
      trim: true,
    },
    phase: {
      type: String,
      enum: ["phase1", "horc", "custom"],
      default: "phase1",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["draft", "published", "completed", "cancelled"],
      default: "draft",
    },
    electionCommission: {
      type: ElectionCommissionSchema,
      default: () => ({}),
    },
    timeline: {
      type: ElectionTimelineSchema,
      required: true,
    },
    votingAccess: {
      type: ElectionVotingAccessSchema,
      default: () => ({}),
    },
    mockSettings: {
      type: ElectionMockSettingsSchema,
      default: () => ({}),
    },
    posts: {
      type: [ElectionPostSchema],
      default: [],
    },
    resultPublication: {
      type: ElectionResultPublicationSchema,
      default: () => ({}),
    },
    votingEmailDispatch: {
      type: ElectionVotingEmailDispatchSchema,
      default: () => ({}),
    },
    testEmailDispatch: {
      type: ElectionVotingEmailDispatchSchema,
      default: () => ({}),
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

ElectionSchema.index({ status: 1, "timeline.votingStartAt": -1 })
ElectionSchema.index({ academicYear: 1, phase: 1, createdAt: -1 })

const Election = mongoose.model("Election", ElectionSchema)

export default Election
