import mongoose from "mongoose"

const proofSchema = new mongoose.Schema(
  {
    label: {
      type: String,
      trim: true,
      default: "",
    },
    url: {
      type: String,
      trim: true,
      required: true,
    },
  },
  {
    _id: true,
  }
)

const referenceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    designation: {
      type: String,
      trim: true,
      default: "",
    },
    department: {
      type: String,
      trim: true,
      default: "",
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: "",
    },
  },
  {
    _id: true,
  }
)

const scoredItemSchema = new mongoose.Schema(
  {
    year: {
      type: String,
      trim: true,
      default: "",
    },
    title: {
      type: String,
      trim: true,
      required: true,
    },
    level: {
      type: String,
      trim: true,
      default: "",
    },
    eventName: {
      type: String,
      trim: true,
      default: "",
    },
    performance: {
      type: String,
      trim: true,
      default: "",
    },
    participationType: {
      type: String,
      enum: ["individual", "team"],
      default: "individual",
    },
    referenceCode: {
      type: String,
      trim: true,
      default: "",
    },
    scoreType: {
      type: String,
      trim: true,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    proofs: {
      type: [proofSchema],
      default: [],
    },
    calculatedPoints: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: true,
  }
)

const personalAcademicSchema = new mongoose.Schema(
  {
    programme: {
      type: String,
      trim: true,
      default: "",
    },
    department: {
      type: String,
      trim: true,
      default: "",
    },
    hostelAddress: {
      type: String,
      trim: true,
      default: "",
    },
    homeAddress: {
      type: String,
      trim: true,
      default: "",
    },
    mobileNumber: {
      type: String,
      trim: true,
      default: "",
    },
    facultyAdvisorName: {
      type: String,
      trim: true,
      default: "",
    },
    facultyAdvisorPhone: {
      type: String,
      trim: true,
      default: "",
    },
    projectGuideName: {
      type: String,
      trim: true,
      default: "",
    },
    projectGuidePhone: {
      type: String,
      trim: true,
      default: "",
    },
    thesisGuideName: {
      type: String,
      trim: true,
      default: "",
    },
    thesisGuidePhone: {
      type: String,
      trim: true,
      default: "",
    },
    references: {
      type: [referenceSchema],
      default: [],
    },
    isPassingOutStudent: {
      type: Boolean,
      default: false,
    },
    hasNoDisciplinaryAction: {
      type: Boolean,
      default: false,
    },
    hasNoFrGrade: {
      type: Boolean,
      default: false,
    },
    declarationAccepted: {
      type: Boolean,
      default: false,
    },
  },
  {
    _id: false,
  }
)

const courseworkSchema = new mongoose.Schema(
  {
    evaluationMode: {
      type: String,
      enum: ["ug_cgpa", "pg_cpi", "research_coursework_cpi"],
      default: "ug_cgpa",
    },
    scoreValue: {
      type: Number,
      min: 6.5,
      max: 10,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    calculatedPoints: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  }
)

const projectThesisSchema = new mongoose.Schema(
  {
    track: {
      type: String,
      enum: ["btech_project", "pg_thesis"],
      default: "btech_project",
    },
    btpAwardLevel: {
      type: String,
      enum: ["none", "institute_best", "second", "third", "department_award_or_nomination"],
      default: "none",
    },
    projectGrade: {
      type: String,
      enum: ["none", "AP", "AA", "AB", "BB", "OTHER"],
      default: "none",
    },
    publicationItems: {
      type: [scoredItemSchema],
      default: [],
    },
    technologyTransferItems: {
      type: [scoredItemSchema],
      default: [],
    },
    calculatedPoints: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  }
)

const scoreBreakdownSchema = new mongoose.Schema(
  {
    coursework: { type: Number, default: 0 },
    projectThesis: { type: Number, default: 0 },
    responsibilities: { type: Number, default: 0 },
    awards: { type: Number, default: 0 },
    cultural: { type: Number, default: 0 },
    scienceTechnology: { type: Number, default: 0 },
    gamesSports: { type: Number, default: 0 },
    coCurricular: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  {
    _id: false,
  }
)

const reviewSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["submitted", "approved", "rejected"],
      default: "submitted",
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    finalScore: {
      type: Number,
      default: 0,
    },
  },
  {
    _id: false,
  }
)

const OverallBestPerformerApplicationSchema = new mongoose.Schema(
  {
    occurrenceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "OverallBestPerformerOccurrence",
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
    awardYear: {
      type: Number,
      required: true,
    },
    studentName: {
      type: String,
      trim: true,
      required: true,
    },
    studentEmail: {
      type: String,
      trim: true,
      default: "",
    },
    rollNumber: {
      type: String,
      trim: true,
      uppercase: true,
      required: true,
    },
    department: {
      type: String,
      trim: true,
      default: "",
    },
    degree: {
      type: String,
      trim: true,
      default: "",
    },
    personalAcademic: {
      type: personalAcademicSchema,
      default: () => ({}),
    },
    coursework: {
      type: courseworkSchema,
      default: () => ({}),
    },
    projectThesis: {
      type: projectThesisSchema,
      default: () => ({}),
    },
    responsibilityItems: {
      type: [scoredItemSchema],
      default: [],
    },
    awardItems: {
      type: [scoredItemSchema],
      default: [],
    },
    culturalItems: {
      type: [scoredItemSchema],
      default: [],
    },
    scienceTechnologyItems: {
      type: [scoredItemSchema],
      default: [],
    },
    gamesSportsItems: {
      type: [scoredItemSchema],
      default: [],
    },
    coCurricularItems: {
      type: [scoredItemSchema],
      default: [],
    },
    scoreBreakdown: {
      type: scoreBreakdownSchema,
      default: () => ({}),
    },
    review: {
      type: reviewSchema,
      default: () => ({}),
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

OverallBestPerformerApplicationSchema.index({ occurrenceId: 1, studentUserId: 1 }, { unique: true })
OverallBestPerformerApplicationSchema.index({ occurrenceId: 1, rollNumber: 1 })
OverallBestPerformerApplicationSchema.index({ "review.status": 1, occurrenceId: 1 })

const OverallBestPerformerApplication = mongoose.model(
  "OverallBestPerformerApplication",
  OverallBestPerformerApplicationSchema
)

export default OverallBestPerformerApplication
