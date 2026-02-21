/**
 * Event Model
 * Hostel events
 */

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

eventSchema.index({ hostelId: 1, gender: 1, dateAndTime: 1 })
eventSchema.index({ dateAndTime: 1 })

const Event = mongoose.model("Event", eventSchema)
export default Event
