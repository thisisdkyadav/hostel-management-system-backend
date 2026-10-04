import mongoose from "mongoose"
const id = { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
const str = { type: String, trim: true, default: "" }
export const H4DetailsSchema = new mongoose.Schema(
  {
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: "AccommodationBatch", default: null },
    batchLabel: str,
    revision: { type: Number, default: 0 },
    creatorName: str,
    creatorEmail: str,
    facultyUserId: id,
    facultyName: str,
    facultyEmail: str,
    category: { type: String, enum: ["intern", "unregistered-student"], default: "intern" },
    gender: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },
    institute: str,
    instituteAddress: str,
    course: str,
    department: str,
    payer: {
      type: { type: String, enum: ["intern", "faculty"], default: "intern" },
      name: str,
      email: str,
      verifiedBy: id,
      verifiedAt: { type: Date, default: null },
    },
    mess: { type: String, enum: ["with", "without"], default: "without" },
    proofRefs: { type: [String], default: [] },
    amendment: {
      changeId: { type: mongoose.Schema.Types.ObjectId, default: null },
      stage: str,
      extraAmount: { type: Number, default: 0 },
    },
    roomHistory: [
      {
        roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
        from: Date,
        to: Date,
        by: id,
        at: { type: Date, default: Date.now },
        reason: str,
        fingerprint: str,
        warnings: { type: [mongoose.Schema.Types.Mixed], default: [] },
      },
    ],
    cancellation: { reason: str, by: id, at: Date, refundNote: str },
    lastNotificationError: str,
  },
  { _id: false },
)
