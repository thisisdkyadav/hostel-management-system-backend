const mongoose = require("mongoose");

const alertSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["fire", "medical", "security-issue", "other"],
    required: true,
  },
  description: {
    type: String,
    required: function () {
      return this.type === "other"; 
    },
  },
  triggeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", 
    required: true,
  },
  recipients: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Alert = mongoose.model("Alert", alertSchema);
module.exports = Alert;
