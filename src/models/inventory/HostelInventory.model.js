/**
 * Hostel Inventory Model
 * Inventory allocated to hostels
 */

import mongoose from "mongoose"

const HostelInventorySchema = new mongoose.Schema({
  hostelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Hostel",
    required: true,
  },
  itemTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "InventoryItemType",
    required: true,
  },
  allocatedCount: {
    type: Number,
    required: true,
    default: 0,
  },
  availableCount: {
    type: Number,
    required: true,
    default: 0,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

// Create a compound index for hostelId and itemTypeId to ensure uniqueness
HostelInventorySchema.index({ hostelId: 1, itemTypeId: 1 }, { unique: true })

HostelInventorySchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

// Method to check if there's enough available inventory
HostelInventorySchema.methods.hasAvailable = function (count) {
  return this.availableCount >= count
}

// Static method to update available count
HostelInventorySchema.statics.updateAvailableCount = async function (hostelId, itemTypeId, change) {
  const inventory = await this.findOne({ hostelId, itemTypeId })
  if (!inventory) {
    throw new Error("Inventory record not found")
  }

  const newCount = inventory.availableCount + change
  if (newCount < 0) {
    throw new Error("Not enough inventory available")
  }

  inventory.availableCount = newCount
  return inventory.save()
}

const HostelInventory = mongoose.model("HostelInventory", HostelInventorySchema)
export default HostelInventory
