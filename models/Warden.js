import mongoose from "mongoose"

const wardenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  hostelIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Hostel" }],
  activeHostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", default: null },
  status: {
    type: String,
    enum: ["assigned", "unassigned"],
    default: "unassigned",
  },
  joinDate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// Add a pre-save hook to update status based on hostelIds?
// wardenSchema.pre('save', function(next) {
//   this.status = this.hostelIds && this.hostelIds.length > 0 ? 'assigned' : 'unassigned';
//   // Also potentially update activeHostelId if it's null or no longer valid
//   if (this.hostelIds && this.hostelIds.length > 0) {
//       if (!this.activeHostelId || !this.hostelIds.includes(this.activeHostelId)) {
//           this.activeHostelId = this.hostelIds[0]; // Default to the first assigned hostel
//       }
//   } else {
//       this.activeHostelId = null; // No hostels assigned
//   }
//   next();
// });

const Warden = mongoose.model("Warden", wardenSchema)
export default Warden
