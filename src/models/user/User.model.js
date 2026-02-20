/**
 * User Model
 * Core user entity for all system users
 */

import mongoose from "mongoose"

const AuthzConstraintOverrideSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: false }
)

const UserAuthzSchema = new mongoose.Schema(
  {
    override: {
      allowRoutes: { type: [String], default: [] },
      denyRoutes: { type: [String], default: [] },
      allowCapabilities: { type: [String], default: [] },
      denyCapabilities: { type: [String], default: [] },
      constraints: { type: [AuthzConstraintOverrideSchema], default: [] },
    },
    meta: {
      version: { type: Number, default: 1 },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      updatedAt: { type: Date, default: null },
    },
  },
  { _id: false }
)

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    profileImage: { type: String },
    role: {
      type: String,
      enum: ["Student", "Maintenance Staff", "Warden", "Associate Warden", "Admin", "Security", "Super Admin", "Hostel Supervisor", "Hostel Gate", "Gymkhana"],
      required: true,
    },
    subRole: {
      type: String,
      enum: [
        // Gymkhana subroles
        "GS Gymkhana",
        "President Gymkhana",
        // Admin SA subroles
        "Student Affairs",
        "Joint Registrar SA",
        "Associate Dean SA",
        "Dean SA",
      ],
      default: null,
    },
    authz: {
      type: UserAuthzSchema,
      default: undefined,
    },
    pinnedTabs: {
      type: [String],
      default: undefined,
    },
    password: { type: String, default: null },
    aesKey: { type: String },
    acceptingAppointments: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

UserSchema.virtual("hostel", {
  ref: function () {
    switch (this.role) {
      case "Warden":
        return "Warden"
      case "Associate Warden":
        return "AssociateWarden"
      case "Security":
        return "Security"
      case "Hostel Supervisor":
        return "HostelSupervisor"
      case "Hostel Gate":
        return "HostelGate"
      default:
        return null
    }
  },
  localField: "_id",
  foreignField: "userId",
  justOne: true,
})

UserSchema.pre(/^find/, function (next) {
  this.populate({
    path: "hostel",
    populate: [
      {
        path: "activeHostelId",
        select: "name type",
        model: "Hostel",
        options: { strictPopulate: false },
      },
      {
        path: "hostelId",
        select: "name type",
        model: "Hostel",
        options: { strictPopulate: false },
      },
    ],
    options: { strictPopulate: false },
  })
  next()
})

UserSchema.post(/^find/, function (docs, next) {
  if (docs && !Array.isArray(docs)) {
    docs = [docs]
  }

  if (!docs) {
    return next()
  }

  docs.forEach((doc) => {
    if (!doc || !doc.hostel) {
      if (doc) doc.hostel = null
      return
    }

    let populatedHostel = null

    if (doc.role === "Warden" || doc.role === "Associate Warden" || doc.role === "Hostel Supervisor") {
      if (doc.hostel.activeHostelId && doc.hostel.activeHostelId._id) {
        populatedHostel = doc.hostel.activeHostelId
      }
    } else if (doc.role === "Security" || doc.role === "Hostel Gate") {
      if (doc.hostel.hostelId && doc.hostel.hostelId._id) {
        populatedHostel = doc.hostel.hostelId
      }
    }

    if (populatedHostel) {
      doc.hostel = {
        _id: populatedHostel._id,
        name: populatedHostel.name,
        type: populatedHostel.type,
      }
    } else {
      doc.hostel = null
    }
  })

  next()
})

UserSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const User = mongoose.model("User", UserSchema)

export default User
