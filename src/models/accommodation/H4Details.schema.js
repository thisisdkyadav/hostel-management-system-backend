import mongoose from "mongoose"
const id = { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }
const str = { type: String, trim: true, default: "" }
// Mess is billed inside the single student payment (r.payment); this keeps the
// breakdown for the email, access page and invoice.
const MessChargeSchema = new mongoose.Schema({
  dailyRate: { type: Number, default: 0 },
  days: { type: Number, default: 0 },
  calculatedAmount: { type: Number, default: 0 },
  amountOverridden: { type: Boolean, default: false },
  amount: { type: Number, default: 0 },
}, { _id: false })
// Student's photo for the mess, uploaded from the access link once a caterer is
// assigned. CW Office checks it manually; it is only stored, never sent to a scanner.
const MessPhotoSchema = new mongoose.Schema({
  status: { type: String, enum: ["Pending", "Submitted", "Approved", "Rejected"], default: "Pending" },
  fileRef: str,
  submittedAt: { type: Date, default: null },
  reviewedBy: id,
  reviewedAt: { type: Date, default: null },
  note: str,
}, { _id: false })
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
    // Always the student since the combined bill; kept for the invoice addressee.
    payer: {
      type: { type: String, enum: ["intern", "faculty"], default: "intern" },
      name: str,
      email: str,
      verifiedBy: id,
      verifiedAt: { type: Date, default: null },
    },
    accommodationDailyRate: { type: Number, default: 0 },
    accommodationChargeDays: { type: Number, default: 0 },
    accommodationCalculatedAmount: { type: Number, default: 0 },
    accommodationAmountOverridden: { type: Boolean, default: false },
    mess: { type: String, enum: ["with", "without"], default: "without" },
    messCharge: { type: MessChargeSchema, default: null },
    // Dining caterer chosen by Accounts when the payment is verified.
    caterer: {
      type: new mongoose.Schema(
        {
          catererId: { type: mongoose.Schema.Types.ObjectId, ref: "Caterer", required: true },
          name: str,
          assignedBy: id,
          assignedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
      default: null,
    },
    messPhoto: { type: MessPhotoSchema, default: null },
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
    // Last letter emailed to the student (see h4.letters.js studentLetterKind);
    // the student is written to again only when the key changes.
    studentLetter: { key: str, sentAt: { type: Date, default: null } },
  },
  { _id: false },
)
