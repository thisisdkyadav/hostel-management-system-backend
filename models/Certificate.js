import mongoose from "mongoose"

const CertificateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    certificateType: {
      type: String,
      required: true,
    },
    certificateUrl: {
      type: String,
      required: true,
    },
    issueDate: {
      type: Date,
      default: Date.now,
      required: true,
    },
    remarks: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
)

export default mongoose.model("Certificate", CertificateSchema)
