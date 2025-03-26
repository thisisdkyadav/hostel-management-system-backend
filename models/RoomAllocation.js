import mongoose from "mongoose"

const RoomAllocationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentProfileId: { type: mongoose.Schema.Types.ObjectId, ref: "StudentProfile", required: true },
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" },
    bedNumber: { type: Number, required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

RoomAllocationSchema.virtual("room", {
  ref: "Room",
  localField: "roomId",
  foreignField: "_id",
  justOne: true,
})

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

RoomAllocationSchema.post("save", async function () {
  try {
    const StudentProfile = mongoose.model("StudentProfile")
    await StudentProfile.findByIdAndUpdate(this.studentProfileId, { currentRoomAllocation: this._id })

    const Room = mongoose.model("Room")
    await Room.findByIdAndUpdate(this.roomId, { $inc: { occupancy: 1 } })
  } catch (error) {
    console.error("Error in post-save hook:", error)
  }
})

RoomAllocationSchema.pre("findOneAndUpdate", async function () {
  try {
    const update = this.getUpdate()
    if (update && update.roomId) {
      const allocation = await this.model.findOne(this.getQuery())

      if (allocation) {
        this._oldRoomId = allocation.roomId
        this._newRoomId = update.roomId
      }
    }
  } catch (error) {
    console.error("Error in pre-findOneAndUpdate hook:", error)
  }
})

RoomAllocationSchema.post("findOneAndUpdate", async function (result) {
  try {
    if (this._oldRoomId && this._newRoomId) {
      const Room = mongoose.model("Room")

      await Room.findByIdAndUpdate(this._oldRoomId, { $inc: { occupancy: -1 } })

      await Room.findByIdAndUpdate(this._newRoomId, { $inc: { occupancy: 1 } })
    }
  } catch (error) {
    console.error("Error in post-findOneAndUpdate hook:", error)
  }
})

RoomAllocationSchema.pre("deleteOne", { query: true, document: false }, async function () {
  try {
    const query = this.getQuery()
    const allocation = await this.model.findOne(query).lean()

    if (allocation) {
      const StudentProfile = mongoose.model("StudentProfile")
      await StudentProfile.findByIdAndUpdate(allocation.studentProfileId, { $unset: { currentRoomAllocation: "" } })

      const Room = mongoose.model("Room")
      await Room.findByIdAndUpdate(allocation.roomId, { $inc: { occupancy: -1 } })
    }
  } catch (error) {
    console.error("Error in pre-deleteOne hook (query middleware):", error)
  }
})

RoomAllocationSchema.pre("findOneAndDelete", async function () {
  try {
    const allocation = await this.model.findOne(this.getQuery())

    if (allocation) {
      const StudentProfile = mongoose.model("StudentProfile")
      await StudentProfile.findByIdAndUpdate(allocation.studentProfileId, { $unset: { currentRoomAllocation: "" } })

      const Room = mongoose.model("Room")
      await Room.findByIdAndUpdate(allocation.roomId, { $inc: { occupancy: -1 } })
    }
  } catch (error) {
    console.error("Error in pre-findOneAndDelete hook:", error)
  }
})

RoomAllocationSchema.pre("deleteMany", async function () {
  try {
    const query = this.getQuery()
    const allocations = await this.model.find(query).lean()

    if (allocations && allocations.length > 0) {
      const StudentProfile = mongoose.model("StudentProfile")

      const studentProfileIds = allocations.map((a) => a.studentProfileId)

      await StudentProfile.updateMany({ _id: { $in: studentProfileIds } }, { $unset: { currentRoomAllocation: "" } })
    }
  } catch (error) {
    console.error("Error in pre-deleteMany hook:", error)
  }
})

const RoomAllocation = mongoose.model("RoomAllocation", RoomAllocationSchema)
export default RoomAllocation
