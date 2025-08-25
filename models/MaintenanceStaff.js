import mongoose from "mongoose"

const MaintenanceStaffSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  category: {
    type: String,
    enum: ["Plumbing", "Electrical", "Civil", "Cleanliness", "Internet", "Attendant", "Other"],
    required: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

const MaintenanceStaff = mongoose.model("MaintenanceStaff", MaintenanceStaffSchema)
export default MaintenanceStaff
