import mongoose from "mongoose"

const pollSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  },
  options: [
    {
      option: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
      },
      votes: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      voteCount: {
        type: Number,
        default: 0,
      },
    },
  ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true,
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

pollSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const Poll = mongoose.model("Poll", pollSchema)
export default Poll
