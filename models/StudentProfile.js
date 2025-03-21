import mongoose from "mongoose"

const StudentProfileSchema = new mongoose.Schema({
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
  admissionDate: {
    type: Date,
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
    enum: ["Male", "Female", "Other"],
    trim: true,
  },
  currentRoomAllocation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RoomAllocation",
  },
})

const StudentProfile = mongoose.model("StudentProfile", StudentProfileSchema)

export default StudentProfile
