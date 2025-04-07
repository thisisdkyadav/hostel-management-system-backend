import mongoose from "mongoose"

const eventSchema = new mongoose.Schema(
  {
    eventName: {
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
    dateAndTime: {
      type: Date,
      required: true,
    },
    hostelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hostel",
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

eventSchema.virtual("hostel", {
  ref: "Hostel",
  localField: "hostelId",
  foreignField: "_id",
  justOne: true,
})

eventSchema.pre(/^find/, function (next) {
  this.populate("hostel", "name")
  next()
})

const Event = mongoose.model("Event", eventSchema)
export default Event
