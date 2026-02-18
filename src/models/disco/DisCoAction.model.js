/**
 * Disciplinary Committee Action Model
 * Stores disciplinary actions taken against users
 */

import mongoose from "mongoose";

const ReminderItemSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    isDone: {
      type: Boolean,
      default: false,
    },
    doneAt: {
      type: Date,
      default: null,
    },
    doneBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: true }
);

const DisCoActionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  reason: {
    type: String,
    required: true,
  },
  actionTaken: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
    required: true,
  },
  remarks: {
    type: String,
  },
  reminderItems: {
    type: [ReminderItemSchema],
    default: [],
  },
});

export default mongoose.model("DisCoAction", DisCoActionSchema);
