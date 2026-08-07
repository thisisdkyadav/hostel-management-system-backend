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

HostelInventorySchema.pre("save", function () {
  this.updatedAt = Date.now()
})

// Method to check if there's enough available inventory
HostelInventorySchema.methods.hasAvailable = function (count) {
  return this.availableCount >= count
}

// NOTE: availableCount is mutated ONLY by the inventory owner service
// (src/services/inventory/inventoryOwner.service.js) via atomic guarded $inc.
// The old read-modify-write `updateAvailableCount` static was removed — it
// oversold under concurrency and its only caller (a StudentInventory post-save
// hook) passed mismatched args and silently failed.

const HostelInventory = mongoose.model("HostelInventory", HostelInventorySchema)
export default HostelInventory
