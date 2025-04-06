import mongoose from "mongoose";

const DisCoActionSchema = new mongoose.Schema({
 userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reason: {
    type: String,
    required: true,
  },
  actionTaken: {
    type: String, 
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
    required: true,
  },
  remarks: {
    type: String,
  },
});

export default mongoose.model("DisCoAction", DisCoActionSchema);
