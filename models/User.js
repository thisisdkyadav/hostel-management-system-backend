import mongoose from "mongoose"

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    profilePic: { type: String },
    role: {
      type: String,
      enum: ["Student", "Maintenance Staff", "Warden", "Associate Warden", "Admin", "Security"],
      required: true,
    },
    password: { type: String },
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
    select: "hostelId",
    populate: {
      path: "hostelId",
      select: "name",
      model: "Hostel",
    },
  })
  next()
})

UserSchema.post(/^find/, function (docs, next) {
  if (!Array.isArray(docs)) {
    docs = [docs]
  }

  docs.forEach((doc) => {
    if (doc && doc.hostel && doc.hostel.hostelId) {
      const simplifiedHostel = {
        _id: doc.hostel.hostelId._id,
        name: doc.hostel.hostelId.name,
      }

      doc.hostel = simplifiedHostel
    } else if (doc) {
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
