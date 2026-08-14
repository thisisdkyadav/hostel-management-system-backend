/**
 * Accommodation Request Model
 *
 * One workflow instance: a student requesting hostel accommodation for visitors.
 * Replaces the thin 3-state VisitorRequest. The status field drives a state
 * machine (see backend/docs/accommodation-flow.md); only "Active" guest rooms
 * form the bookable inventory and guest occupancy is temporal (date-range),
 * computed from `rooms[]` across overlapping requests, never from Room.occupancy.
 */

import mongoose from "mongoose"

export const ACCOMMODATION_STATUS = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PENDING_CWO_CAPACITY: "Pending CWO Capacity Check",
  PENDING_FA_RECOMMENDATION: "Pending FA Recommendation",
  PENDING_CW_APPROVAL: "Pending CW Approval",
  RETURNED_TO_STUDENT: "Returned to Student",
  REJECTED: "Rejected",
  CW_APPROVED: "CW Approved",
  PAYMENT_REQUESTED: "Payment Requested",
  PAYMENT_DEFERRED: "Payment Deferred",
  PAYMENT_SUBMITTED: "Payment Submitted",
  PAYMENT_VERIFIED: "Payment Verified",
  // Legacy: hostel allotment is now part of the payment request. Kept in the
  // enum so requests already sitting at this status can still be completed.
  HOSTEL_ALLOTTED: "Hostel Allotted",
  ROOMS_ASSIGNED: "Rooms Assigned",
  CHECKED_IN: "Checked In",
  CHECKED_OUT: "Checked Out",
  INVOICED: "Invoiced",
  CANCELLED: "Cancelled",
}

export const ACCOMMODATION_STATUSES = Object.values(ACCOMMODATION_STATUS)

// Actions recorded against approval/payment stages.
export const ACCOMMODATION_ACTIONS = {
  RECOMMEND: "recommend",
  REQUEST_MODIFICATION: "request_modification",
  REJECT: "reject",
  APPROVE: "approve",
  AUTO_APPROVE: "auto_approve",
  BYPASS_FA: "bypass_fa",
}

export const ADDRESS_PROOF_TYPES = ["PAN", "Voter ID", "Driving License", "Institute ID"]

export const PAYMENT_STATUS = {
  PENDING: "Pending",
  DEFERRED: "Deferred", // student chose "pay later"; can pay any time; rooms after payment
  SUBMITTED: "Submitted",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
}

// How the student chose to settle the bill.
export const PAYMENT_MODE = {
  NOW: "now",
  LATER: "later",
}

// Guest days run 11:00 → 11:00. Anything outside that is a requested extension.
export const STANDARD_CHECK_TIME = "11:00"

export const ROOM_PREFERENCE = {
  SINGLE: "Single",
  DOUBLE: "Double",
}

export const ROOM_PREFERENCES = Object.values(ROOM_PREFERENCE)

const GuestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    gender: { type: String, enum: ["Male", "Female", "Other"], required: true },
    age: { type: Number, min: 0, max: 150 }, // years (required at submit)
    relation: { type: String, trim: true }, // relation to the student (required at submit)
    aadharNumber: { type: String, trim: true }, // 12-digit Aadhaar (required at submit)
    remarks: { type: String, trim: true },
  },
  { _id: false }
)

const AddressProofSchema = new mongoose.Schema(
  {
    documentType: { type: String, enum: ADDRESS_PROOF_TYPES },
    fileRef: { type: String }, // storage-backend fileRef
  },
  { _id: false }
)

// Per-guest charge lines set by Chief Warden Office when requesting payment.
const GuestChargeSchema = new mongoose.Schema(
  {
    guestIndex: { type: Number, default: 0 },
    guestName: { type: String, default: "" },
    price: { type: Number, default: 0 }, // per-person amount for the stay
    gstPercentage: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
  },
  { _id: false }
)

const QuoteSchema = new mongoose.Schema(
  {
    persons: { type: Number, default: 0 },
    nights: { type: Number, default: 0 },
    // Reference tariff (average / shared price) for invoice sheets; not auto-calc.
    feePerPersonPerNight: { type: Number, default: 0 },
    subtotal: { type: Number, default: 0 },
    gstPercentage: { type: Number, default: 0 },
    gstAmount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    guestCharges: { type: [GuestChargeSchema], default: [] },
  },
  { _id: false }
)

const ApprovalEntrySchema = new mongoose.Schema(
  {
    stage: { type: String, required: true }, // e.g. "facultyAdvisor", "chiefWarden"
    action: { type: String, enum: Object.values(ACCOMMODATION_ACTIONS), required: true },
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    actorEmail: { type: String, default: null }, // for token-based (FA) actors
    reason: { type: String, default: null },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
)

const PaymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, default: 0 },
    paymentLink: { type: String, default: "" },
    qrRef: { type: String, default: "" },
    mode: { type: String, enum: [...Object.values(PAYMENT_MODE), null], default: null },
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    screenshotFileRef: { type: String, default: "" },
    utr: { type: String, default: "" }, // 12-digit numeric UTR of the transfer
    paidAt: { type: Date, default: null }, // date the student made the payment
    remarks: { type: String, default: "" }, // CW Office note, e.g. why the amount differs
    submittedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    verifiedAt: { type: Date, default: null },
    note: { type: String, default: "" },
  },
  { _id: false }
)

const RoomAssignmentSchema = new mongoose.Schema(
  {
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    guestIndexes: { type: [Number], default: [] }, // indexes into guests[]
  },
  { _id: false }
)

const InvoiceSchema = new mongoose.Schema(
  {
    number: { type: String, default: "" },
    pdfFileRef: { type: String, default: "" },
    gstApplicable: { type: Boolean, default: false },
    generatedAt: { type: Date, default: null },
    emailedAt: { type: Date, default: null },
  },
  { _id: false }
)

const TimelineEntrySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    at: { type: Date, default: Date.now },
    note: { type: String, default: "" },
  },
  { _id: false }
)

const AccommodationRequestSchema = new mongoose.Schema(
  {
    typeKey: { type: String, required: true }, // -> AccommodationType.key
    requesterUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Applicant snapshot (from H2 form / student profile)
    applicantName: { type: String, trim: true },
    applicantPhone: { type: String, trim: true },
    applicantEmail: { type: String, trim: true, lowercase: true },
    facultyAdvisorEmail: { type: String, trim: true, lowercase: true, default: null },

    permanentAddress: { type: String, trim: true },
    addressProof: { type: AddressProofSchema, default: () => ({}) },
    guests: { type: [GuestSchema], default: [] },
    // Student's preferred room type for guests (assignment still decided by supervisor).
    // Required at submit; optional on schema so older requests remain valid.
    roomPreference: { type: String, enum: ROOM_PREFERENCES },

    // fromDate/toDate stay date-only (the calendar days billed); the times are
    // kept separately as "HH:mm" so nights never shift with a timezone.
    stay: {
      fromDate: { type: Date },
      toDate: { type: Date },
      checkInTime: { type: String, default: STANDARD_CHECK_TIME },
      checkOutTime: { type: String, default: STANDARD_CHECK_TIME },
      // Hours requested outside the standard 11:00 → 11:00 window. Recorded so
      // the hostel holds the room; they do not change the charge.
      earlyCheckInHours: { type: Number, default: 0 },
      lateCheckOutHours: { type: Number, default: 0 },
      purpose: { type: String, trim: true },
    },
    persons: { type: Number, default: 0 },
    nights: { type: Number, default: 0 },
    quote: { type: QuoteSchema, default: () => ({}) },

    // Workflow control
    status: { type: String, enum: ACCOMMODATION_STATUSES, default: ACCOMMODATION_STATUS.DRAFT },
    currentStage: { type: String, default: null }, // active approval stage id
    stageDeadlineAt: { type: Date, default: null }, // for 24h auto-approve
    approvals: { type: [ApprovalEntrySchema], default: [] },

    payment: { type: PaymentSchema, default: () => ({}) },

    allotment: {
      hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", default: null },
      allottedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      allottedAt: { type: Date, default: null },
    },

    rooms: { type: [RoomAssignmentSchema], default: [] },
    roomsAssignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    roomsAssignedAt: { type: Date, default: null },
    checkInAt: { type: Date, default: null },
    checkOutAt: { type: Date, default: null },

    invoice: { type: InvoiceSchema, default: () => ({}) },

    timeline: { type: [TimelineEntrySchema], default: [] },

    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

AccommodationRequestSchema.index({ requesterUserId: 1, createdAt: -1 })
AccommodationRequestSchema.index({ status: 1, createdAt: -1 })
AccommodationRequestSchema.index({ currentStage: 1, stageDeadlineAt: 1 }) // auto-approve sweep
AccommodationRequestSchema.index({ "allotment.hostelId": 1, status: 1 })
AccommodationRequestSchema.index({ "stay.fromDate": 1, "stay.toDate": 1 }) // availability overlap

AccommodationRequestSchema.pre("save", function () {
  this.updatedAt = Date.now()
})

const AccommodationRequest = mongoose.model("AccommodationRequest", AccommodationRequestSchema)
export default AccommodationRequest
