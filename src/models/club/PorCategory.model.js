import mongoose from "mongoose"

const GYMKHANA_REVIEW_STEP_SCHEMA = new mongoose.Schema(
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

const PorCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    gymkhanaSteps: {
      type: [GYMKHANA_REVIEW_STEP_SCHEMA],
      default: [],
    },
    legacyClubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      default: null,
      index: true,
    },
    legacyGymkhanaCategoryKey: {
      type: String,
      trim: true,
      default: "",
    },
    isLegacyMigrated: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

PorCategorySchema.index({ legacyClubId: 1 }, { unique: true, sparse: true })

const PorCategory = mongoose.model("PorCategory", PorCategorySchema)

export default PorCategory
