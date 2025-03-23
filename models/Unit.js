import mongoose from "mongoose"

const UnitSchema = new mongoose.Schema(
  {
    hostelId: { type: mongoose.Schema.Types.ObjectId, ref: "Hostel", required: true },
    unitNumber: { type: String, required: true },
    floor: { type: Number },
    commonAreaDetails: { type: String },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

UnitSchema.index({ hostelId: 1, unitNumber: 1 }, { unique: true })

// Virtual to get all rooms in this unit
UnitSchema.virtual("rooms", {
  ref: "Room",
  localField: "_id",
  foreignField: "unitId",
  justOne: false,
})

// Virtual to get room count
UnitSchema.virtual("roomCount").get(function () {
  return this.rooms ? this.rooms.length : 0
})

// Virtual to get capacity of Active rooms
UnitSchema.virtual("capacity").get(function () {
  if (!this.rooms) return 0
  return this.rooms.filter((room) => room.status === "Active").reduce((total, room) => total + room.capacity, 0)
})

// Virtual to get occupancy
UnitSchema.virtual("occupancy").get(function () {
  if (!this.rooms) return 0
  return this.rooms.filter((room) => room.status === "Active").reduce((total, room) => total + room.occupancy, 0)
})

UnitSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const Unit = mongoose.model("Unit", UnitSchema)
export default Unit
