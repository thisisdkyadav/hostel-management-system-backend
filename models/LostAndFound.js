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
    enum: ["active", "claimed"],
    default: "active",
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
})

const LostAndFound = mongoose.model("LostAndFound", lostAndFoundSchema)
export default LostAndFound
