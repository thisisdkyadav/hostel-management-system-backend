import mongoose from "mongoose"

const CatererSchema = new mongoose.Schema(
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
      default: null,
      unique: true,
      sparse: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
)

CatererSchema.index({ isArchived: 1, name: 1 })

CatererSchema.pre("validate", function () {
  if (this.name) {
    this.name = this.name.trim()
    this.nameLower = this.name.toLowerCase()
  }

  if (this.email) {
    this.email = this.email.trim().toLowerCase()
    this.emailLower = this.email
  }
})

CatererSchema.virtual("id").get(function () {
  return this._id
})

CatererSchema.set("toJSON", { virtuals: true })

const Caterer = mongoose.model("Caterer", CatererSchema)

export default Caterer
