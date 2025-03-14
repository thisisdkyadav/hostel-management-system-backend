import mongoose from "mongoose"

const StudentProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  rollNumber: { type: String, required: true, unique: true },
  department: { type: String, required: true },
  yearOfStudy: { type: Number, required: true },
  profilePic: { type: String },
  address: { type: String },
  dateOfBirth: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const StudentProfile = mongoose.model("StudentProfile", StudentProfileSchema)
export default StudentProfile
