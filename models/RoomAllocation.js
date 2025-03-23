import mongoose from "mongoose"

const RoomAllocationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    bedNumber: { type: Number, required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Ensure a student can only be allocated one room
RoomAllocationSchema.index({ studentProfileId: 1 }, { unique: true })

// Ensure unique bed assignments within a room
RoomAllocationSchema.index({ roomId: 1, bedNumber: 1 }, { unique: true })

// Populate room and unit information for display
RoomAllocationSchema.virtual("room", {
  ref: "Room",
  localField: "roomId",
  foreignField: "_id",
  justOne: true,
})

// Virtual to get formatted room display number
RoomAllocationSchema.virtual("displayRoomNumber").get(function () {
  if (!this.room) return ""

  if (this.room.unitId && typeof this.room.unitId === "object" && this.room.unitId.unitNumber) {
    // For unit-based hostels: <unit><room>-<bed>
    return `${this.room.unitId.unitNumber}${this.room.roomNumber}-${this.bedNumber}`
  } else {
    // For room-only hostels: <room>-<bed>
    return `${this.room.roomNumber}-${this.bedNumber}`
  }
})

// When creating a new allocation, update the student profile and room occupancy
RoomAllocationSchema.post("save", async function () {
  try {
    // Update student profile with the allocation reference
    const StudentProfile = mongoose.model("StudentProfile")
    await StudentProfile.findByIdAndUpdate(this.studentProfileId, { currentRoomAllocation: this._id })

    // Increase room occupancy
    const Room = mongoose.model("Room")
    await Room.findByIdAndUpdate(this.roomId, { $inc: { occupancy: 1 } })
  } catch (error) {
    console.error("Error in post-save hook:", error)
  }
})

// When an allocation is deleted, remove it from the student profile and update room occupancy
RoomAllocationSchema.pre("deleteOne", { document: true, query: false }, async function () {
  try {
    // Remove allocation reference from student profile
    const StudentProfile = mongoose.model("StudentProfile")
    await StudentProfile.findByIdAndUpdate(this.studentProfileId, { $unset: { currentRoomAllocation: "" } })

    // Decrease room occupancy
    const Room = mongoose.model("Room")
    await Room.findByIdAndUpdate(this.roomId, { $inc: { occupancy: -1 } })
  } catch (error) {
    console.error("Error in pre-deleteOne hook:", error)
  }
})

// Handle findOneAndDelete/findByIdAndDelete operations
RoomAllocationSchema.pre("findOneAndDelete", async function () {
  try {
    const allocation = await this.model.findOne(this.getQuery())

    if (allocation) {
      // Remove allocation reference from student profile
      const StudentProfile = mongoose.model("StudentProfile")
      await StudentProfile.findByIdAndUpdate(allocation.studentProfileId, { $unset: { currentRoomAllocation: "" } })

      // Decrease room occupancy
      const Room = mongoose.model("Room")
      await Room.findByIdAndUpdate(allocation.roomId, { $inc: { occupancy: -1 } })
    }
  } catch (error) {
    console.error("Error in pre-findOneAndDelete hook:", error)
  }
})

const RoomAllocation = mongoose.model("RoomAllocation", RoomAllocationSchema)
export default RoomAllocation
