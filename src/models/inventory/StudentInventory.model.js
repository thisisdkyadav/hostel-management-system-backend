/**
 * Student Inventory Model
 * Inventory issued to students
 */

import mongoose from "mongoose"

const StudentInventorySchema = new mongoose.Schema({
  studentProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StudentProfile",
    required: true,
  },
  hostelInventoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "HostelInventory",
    required: true,
  },
  itemTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InventoryItemType",
    required: true,
  },
  count: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
  },
  issueDate: {
    type: Date,
    default: Date.now,
    required: true,
  },
  returnDate: {
    type: Date,
  },
  status: {
    type: String,
    enum: ["Issued", "Returned", "Damaged", "Lost"],
    default: "Issued",
    required: true,
  },
  condition: {
    type: String,
    enum: ["Excellent", "Good", "Fair", "Poor"],
    default: "Good",
  },
  notes: {
    type: String,
  },
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  returnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

StudentInventorySchema.pre("save", function () {
  this.updatedAt = Date.now()
})

StudentInventorySchema.index({ studentProfileId: 1, status: 1, issueDate: -1 })
StudentInventorySchema.index({ hostelInventoryId: 1, status: 1 })
StudentInventorySchema.index({ itemTypeId: 1, status: 1 })
StudentInventorySchema.index({ status: 1 })

// NOTE: hostel availableCount is adjusted on issue/return by the inventory owner
// service (src/services/inventory/inventoryOwner.service.js) inside a transaction
// with the atomic reserve/release. The old post('save') hook + `returnItems`
// static that did this via HostelInventory.updateAvailableCount were removed:
// the hook passed mismatched args (hostelInventoryId as hostelId) so it always
// threw and was silently swallowed — a dead no-op — and the RMW oversold.

// Get inventory summary by unit
StudentInventorySchema.statics.getUnitInventorySummary = async function (unitId) {
  const pipeline = [
    {
      $lookup: {
        from: "roomallocations",
        localField: "studentProfileId",
        foreignField: "studentProfileId",
        as: "allocation",
      },
    },
    { $unwind: "$allocation" },
    {
      $lookup: {
        from: "rooms",
        localField: "allocation.roomId",
        foreignField: "_id",
        as: "room",
      },
    },
    { $unwind: "$room" },
    {
      $match: {
        "room.unitId": new mongoose.Types.ObjectId(unitId),
        status: "Issued",
      },
    },
    {
      $lookup: {
        from: "inventoryitemtypes",
        localField: "itemTypeId",
        foreignField: "_id",
        as: "itemType",
      },
    },
    { $unwind: "$itemType" },
    {
      $group: {
        _id: "$itemTypeId",
        itemName: { $first: "$itemType.name" },
        totalCount: { $sum: "$count" },
      },
    },
  ]

  return this.aggregate(pipeline)
}

// Get inventory summary by floor
StudentInventorySchema.statics.getFloorInventorySummary = async function (hostelId, floor) {
  const pipeline = [
    {
      $lookup: {
        from: "roomallocations",
        localField: "studentProfileId",
        foreignField: "studentProfileId",
        as: "allocation",
      },
    },
    { $unwind: "$allocation" },
    {
      $lookup: {
        from: "rooms",
        localField: "allocation.roomId",
        foreignField: "_id",
        as: "room",
      },
    },
    { $unwind: "$room" },
    {
      $lookup: {
        from: "units",
        localField: "room.unitId",
        foreignField: "_id",
        as: "unit",
      },
    },
    { $unwind: { path: "$unit", preserveNullAndEmptyArrays: true } },
    {
      $match: {
        "allocation.hostelId": new mongoose.Types.ObjectId(hostelId),
        "unit.floor": floor,
        status: "Issued",
      },
    },
    {
      $lookup: {
        from: "inventoryitemtypes",
        localField: "itemTypeId",
        foreignField: "_id",
        as: "itemType",
      },
    },
    { $unwind: "$itemType" },
    {
      $group: {
        _id: "$itemTypeId",
        itemName: { $first: "$itemType.name" },
        totalCount: { $sum: "$count" },
      },
    },
  ]

  return this.aggregate(pipeline)
}

// Get inventory summary by student roll numbers
StudentInventorySchema.statics.getStudentInventorySummary = async function (rollNumbers) {
  const pipeline = [
    {
      $lookup: {
        from: "studentprofiles",
        localField: "studentProfileId",
        foreignField: "_id",
        as: "student",
      },
    },
    { $unwind: "$student" },
    {
      $match: {
        "student.rollNumber": { $in: rollNumbers },
        status: "Issued",
      },
    },
    {
      $lookup: {
        from: "inventoryitemtypes",
        localField: "itemTypeId",
        foreignField: "_id",
        as: "itemType",
      },
    },
    { $unwind: "$itemType" },
    {
      $group: {
        _id: {
          rollNumber: "$student.rollNumber",
          itemTypeId: "$itemTypeId",
        },
        itemName: { $first: "$itemType.name" },
        totalCount: { $sum: "$count" },
      },
    },
    {
      $group: {
        _id: "$_id.rollNumber",
        items: {
          $push: {
            itemTypeId: "$_id.itemTypeId",
            itemName: "$itemName",
            count: "$totalCount",
          },
        },
      },
    },
  ]

  return this.aggregate(pipeline)
}

const StudentInventory = mongoose.model("StudentInventory", StudentInventorySchema)
export default StudentInventory
