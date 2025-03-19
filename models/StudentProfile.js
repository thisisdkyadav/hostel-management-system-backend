import mongoose from "mongoose"

const StudentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
      unique: true,
      index: true,
    },
    rollNumber: {
      type: String,
      required: [true, "Roll number is required"],
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    department: {
      type: String,
      trim: true,
    },
    degree: {
      type: String,
      trim: true,
    },
    yearOfAdmission: {
      type: Number,
      max: [new Date().getFullYear() + 1, "Year of admission cannot be in the future"],
    },
    profilePic: {
      type: String,
      default: null,
    },
    address: {
      type: String,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      validate: {
        validator: function (value) {
          return !value || value <= new Date()
        },
        message: "Date of birth cannot be in the future",
      },
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other", "Prefer not to say"],
      trim: true,
    },
    currentRoomAllocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RoomAllocation",
    },
    status: {
      type: String,
      enum: ["Active", "Graduated", "Suspended", "Withdrawn", "On Leave"],
      default: "Active",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

StudentProfileSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

StudentProfileSchema.pre(["updateOne", "findOneAndUpdate"], function (next) {
  this.set({ updatedAt: Date.now() })
  next()
})

const StudentProfile = mongoose.model("StudentProfile", StudentProfileSchema)

export default StudentProfile
