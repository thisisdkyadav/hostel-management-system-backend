import mongoose from "mongoose"

const DiningMealVerificationSchema = new mongoose.Schema(
  {
    periodId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiningPeriod",
      default: null,
    },
    catererId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Caterer",
      default: null,
    },
    expectedCatererId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Caterer",
      default: null,
    },
    studentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    studentProfileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StudentProfile",
      default: null,
    },
    rollNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    mealSlotKey: {
      type: String,
      default: "",
      trim: true,
    },
    mealSlotName: {
      type: String,
      default: "",
      trim: true,
    },
    scannedAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      enum: ["face-scanner", "manual"],
      default: "face-scanner",
    },
    status: {
      type: String,
      enum: [
        "verified",
        "duplicate",
        "wrong-caterer",
        "not-allocated",
        "unknown-student",
        "outside-meal-time",
        "no-active-period",
      ],
      required: true,
    },
    scannerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FaceScanner",
      default: null,
    },
    deviceId: {
      type: String,
      default: "",
      trim: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

DiningMealVerificationSchema.index({ scannedAt: -1 })
DiningMealVerificationSchema.index({ catererId: 1, scannedAt: -1 })
DiningMealVerificationSchema.index({ periodId: 1, mealSlotKey: 1, studentUserId: 1, status: 1 })
DiningMealVerificationSchema.index({ rollNumber: 1, scannedAt: -1 })

DiningMealVerificationSchema.virtual("id").get(function () {
  return this._id
})

DiningMealVerificationSchema.set("toJSON", { virtuals: true })

const DiningMealVerification = mongoose.model("DiningMealVerification", DiningMealVerificationSchema)

export default DiningMealVerification
