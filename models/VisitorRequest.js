import mongoose from "mongoose";

const visitorRequestSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  numberOfVisitors: {
    type: Number,
    required: true,
    min: 1, 
  },
  visitorNames: {
    type: [String],
    required: true,
    validate: {
      validator: function (value) {
        return value.length === this.numberOfVisitors;
      },
      message: "Number of visitor names must match the number of visitors",
    },
  },
  visitorContact: {
    type: String,
    required: true,
    match: [/^\d{10,15}$/, "Please enter a valid contact number"],
  },
  visitorEmail: {
    type: String,
    required: true,
    match: [
      /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/,
      "Please enter a valid email address",
    ],
  },
  relationWithStudent: {
    type: String,
    required: true,
  },
  
  visitReason: {
    type: String,
    required: true,
  },
  visitDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["Pending", "Approved", "Rejected"],
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const VisitorRequest = mongoose.model("VisitorRequest", visitorRequestSchema);
export default VisitorRequest;
