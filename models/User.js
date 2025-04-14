import mongoose from "mongoose"

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    profileImage: { type: String },
    role: {
      type: String,
      enum: ["Student", "Maintenance Staff", "Warden", "Associate Warden", "Admin", "Security", "Super Admin"],
      required: true,
    },
    password: { type: String },
    aesKey: { type: String },
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

    if (doc.role === "Warden" || doc.role === "Associate Warden") {
      if (doc.hostel.activeHostelId && doc.hostel.activeHostelId._id) {
        populatedHostel = doc.hostel.activeHostelId
      }
    } else if (doc.role === "Security") {
      if (doc.hostel.hostelId && doc.hostel.hostelId._id) {
        populatedHostel = doc.hostel.hostelId
      }
    }

    if (populatedHostel) {
      doc.hostel = {
        _id: populatedHostel._id,
        name: populatedHostel.name,
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
