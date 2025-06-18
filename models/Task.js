import mongoose from "mongoose"

const TaskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  priority: {
    type: String,
    enum: ["Low", "Medium", "High", "Urgent"],
    default: "Medium",
  },
  dueDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["Created", "Assigned", "In Progress", "Completed"],
    default: "Created",
  },
  category: {
    type: String,
    enum: ["Maintenance", "Security", "Administrative", "Housekeeping", "Other"],
    default: "Other",
  },
  assignedUsers: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
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

TaskSchema.pre("save", function (next) {
  this.updatedAt = Date.now()

  // If users are assigned and status is still "Created", change to "Assigned"
  if (this.assignedUsers && this.assignedUsers.length > 0 && this.status === "Created") {
    this.status = "Assigned"
  }

  next()
})

const Task = mongoose.model("Task", TaskSchema)

export default Task
