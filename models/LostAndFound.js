import mongoose from "mongoose"

const lostAndFoundSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100,
  },
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 500,
  },
  dateFound: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ["Active", "Claimed"],
    default: "Active",
  },
  images: [
    {
      type: String,
      trim: true,
    },
  ],
})

const LostAndFound = mongoose.model("LostAndFound", lostAndFoundSchema)
export default LostAndFound
