/**
 * Complaint Model
 * User complaints tracking
 */

import mongoose from "mongoose"

const ComplaintSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: {
    type: String,
    enum: ["Pending", "Resolved", "In Progress", "Forwarded to IDO", "Rejected"],
    default: "Pending",
  },
  category: {
    type: String,
    enum: ["Plumbing", "Electrical", "Civil", "Cleanliness", "Internet", "Other"],
    default: "Other",
  },

  location: { type: String }, // Location of the complaint for complaints outside hostel room/unit
  hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel" }, // Reference to the hostel
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" }, // Reference to the unit (if applicable)
  roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" }, // Reference to the room (if applicable)
  attachments: [{ type: String }], // Array of file paths or URLs
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Staff member assigned to the complaint
  resolutionNotes: { type: String }, // Notes from the staff member after resolving the complaint
  resolutionDate: { type: Date }, // Date when the complaint was resolved
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Staff member who resolved the complaint
  feedback: { type: String }, // Feedback from the user after resolution
  feedbackRating: {
    type: Number,
    enum: [1, 2, 3, 4, 5], // Ratings from 1 to 5
  },
  satisfactionStatus: { type: String, enum: ["Satisfied", "Unsatisfied", "False Resolution"] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

ComplaintSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const Complaint = mongoose.model("Complaint", ComplaintSchema)
export default Complaint
