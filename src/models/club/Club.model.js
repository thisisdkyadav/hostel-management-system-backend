import mongoose from "mongoose"

const ClubSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameLower: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      select: false,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    emailLower: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      select: false,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    gymkhanaCategoryKey: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

ClubSchema.index({ gymkhanaCategoryKey: 1 })
ClubSchema.index({ name: 1 })

ClubSchema.virtual("id").get(function () {
  return this._id
})

ClubSchema.set("toJSON", { virtuals: true })

const Club = mongoose.model("Club", ClubSchema)

export default Club
