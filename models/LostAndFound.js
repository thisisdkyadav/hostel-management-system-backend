import mongoose from "mongoose"

const lostAndFoundSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100,
  },
  category: {
    type: String,
    enum: ["electronics", "clothing", "accessories", "documents", "keys", "other"],
    default: "other",
  },
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 500,
  },
  locationFound: {
    type: String,
    required: true,
    trim: true,
  },
  dateFound: {
    type: Date,
    default: Date.now,
  },
  images: [
    {
      type: String,
      trim: true,
      validate: {
        validator: function (v) {
          return !v || /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i.test(v)
        },
        message: (props) => `${props.value} is not a valid URL!`,
      },
    },
  ],
  status: {
    type: String,
    enum: ["active", "claimed", "verified", "resolved", "deleted"],
    default: "active",
  },
  resolvedDate: {
    type: Date,
  },
  claim: {
    claimantName: String,
    claimantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    claimDescription: String,
    claimDate: Date,
    claimStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  userType: {
    type: String,
    enum: ["student", "warden"],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
})

lostAndFoundSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const LostAndFound = mongoose.model("LostAndFound", lostAndFoundSchema)
export default LostAndFound
