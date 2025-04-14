import mongoose from "mongoose"

const associateWardenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  hostelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hostel" }],
  activeHostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", default: null },
  status: {
    type: String,
    enum: ["assigned", "unassigned"],
    default: "unassigned",
  },
  joinDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const AssociateWarden = mongoose.model("AssociateWarden", associateWardenSchema)
export default AssociateWarden
