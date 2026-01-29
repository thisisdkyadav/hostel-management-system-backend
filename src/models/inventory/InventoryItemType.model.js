/**
 * Inventory Item Type Model
 * Types of inventory items
 */

import mongoose from "mongoose"

const InventoryItemTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  totalCount: { type: Number, required: true, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
})

InventoryItemTypeSchema.pre("save", function (next) {
  this.updatedAt = Date.now()
  next()
})

const InventoryItemType = mongoose.model("InventoryItemType", InventoryItemTypeSchema)
export default InventoryItemType
