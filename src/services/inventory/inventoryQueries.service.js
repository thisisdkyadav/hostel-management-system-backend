/**
 * Inventory Queries Service
 * -------------------------
 * The single READ surface for the inventory domain (InventoryItemType,
 * HostelInventory, StudentInventory). Callers use these instead of importing the
 * models, so all three are touched only inside `src/services/inventory/` (writes
 * live in inventoryOwner.service.js).
 *
 * Reads that feed mutate-then-persist paths return hydrated docs; list/detail
 * reads carry their own populate chains. Aggregation `$match` casts ids to
 * ObjectId where a string id is involved.
 */

import mongoose from "mongoose"
import { InventoryItemType, HostelInventory, StudentInventory } from "../../models/index.js"

const toObjectId = (value) =>
  value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value))

export const inventoryQueries = {
  // ==================== InventoryItemType ====================

  async findItemTypeById(id) {
    return InventoryItemType.findById(id)
  },

  async findItemTypeByName(name) {
    return InventoryItemType.findOne({ name })
  },

  async countItemTypes(filter = {}) {
    return InventoryItemType.countDocuments(filter)
  },

  async listItemTypes(filter = {}, { skip = 0, limit = 10, sort = { name: 1 } } = {}) {
    return InventoryItemType.find(filter).sort(sort).skip(skip).limit(limit)
  },

  // ==================== HostelInventory ====================

  async findHostelInventoryById(id) {
    return HostelInventory.findById(id)
  },

  async findByHostelAndItemType(hostelId, itemTypeId) {
    return HostelInventory.findOne({ hostelId, itemTypeId })
  },

  /** Allocations for one hostel, populated for the hostel view. */
  async findByHostelPopulated(hostelId) {
    return HostelInventory.find({ hostelId })
      .populate("itemTypeId", "name description")
      .populate("hostelId", "name")
  },

  /** Paginated allocations list (populated). */
  async listHostelInventory(filter = {}, { skip = 0, limit = 10 } = {}) {
    return HostelInventory.find(filter)
      .populate("itemTypeId", "name description")
      .populate("hostelId", "name")
      .skip(skip)
      .limit(limit)
  },

  async countHostelInventory(filter = {}) {
    return HostelInventory.countDocuments(filter)
  },

  /** All allocations for a hostel (unpopulated) — used to scope student queries. */
  async findHostelInventoriesByHostel(hostelId) {
    return HostelInventory.find({ hostelId })
  },

  /** Sum of allocatedCount for an item type across hostels (global-cap check). */
  async sumAllocatedByItemType(itemTypeId, { excludeId } = {}) {
    const match = { itemTypeId: toObjectId(itemTypeId) }
    if (excludeId) match._id = { $ne: toObjectId(excludeId) }
    const rows = await HostelInventory.aggregate([
      { $match: match },
      { $group: { _id: null, totalAllocated: { $sum: "$allocatedCount" } } },
    ])
    return rows.length > 0 ? rows[0].totalAllocated : 0
  },

  async countHostelInventoryByItemType(itemTypeId) {
    return HostelInventory.countDocuments({ itemTypeId })
  },

  async getInventorySummaryByHostel() {
    return HostelInventory.aggregate([
      { $lookup: { from: "hostels", localField: "hostelId", foreignField: "_id", as: "hostel" } },
      { $unwind: "$hostel" },
      { $lookup: { from: "inventoryitemtypes", localField: "itemTypeId", foreignField: "_id", as: "itemType" } },
      { $unwind: "$itemType" },
      {
        $group: {
          _id: "$hostelId",
          hostelName: { $first: "$hostel.name" },
          totalAllocated: { $sum: "$allocatedCount" },
          totalAvailable: { $sum: "$availableCount" },
          items: {
            $push: {
              itemTypeId: "$itemTypeId",
              itemName: "$itemType.name",
              allocated: "$allocatedCount",
              available: "$availableCount",
            },
          },
        },
      },
    ])
  },

  // ==================== StudentInventory ====================

  async findStudentInventoryById(id) {
    return StudentInventory.findById(id)
  },

  /** Fully-populated single record (post issue/return/status refresh). */
  async findStudentInventoryByIdDetailed(id) {
    return StudentInventory.findById(id)
      .populate("itemTypeId", "name description")
      .populate("studentProfileId", "rollNumber")
      .populate({ path: "studentProfileId", populate: { path: "userId", select: "name email" } })
      .populate("issuedBy", "name")
      .populate("returnedBy", "name")
  },

  /** A student's non-returned items (populated). */
  async findActiveByStudent(studentProfileId) {
    return StudentInventory.find({ studentProfileId, status: { $ne: "Returned" } })
      .populate("itemTypeId", "name description")
      .populate("hostelInventoryId")
      .populate("issuedBy", "name")
      .sort({ issueDate: -1 })
  },

  async countStudentInventory(filter = {}) {
    return StudentInventory.countDocuments(filter)
  },

  /** Paginated student-inventory list (populated). */
  async listStudentInventory(filter = {}, { skip = 0, limit = 10, sort = { issueDate: -1 } } = {}) {
    return StudentInventory.find(filter)
      .populate("itemTypeId", "name description")
      .populate("studentProfileId", "rollNumber")
      .populate({ path: "studentProfileId", populate: { path: "userId", select: "name email" } })
      .populate("hostelInventoryId")
      .populate("issuedBy", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit)
  },

  async countStudentInventoryByItemType(itemTypeId) {
    return StudentInventory.countDocuments({ itemTypeId })
  },

  /** Issued-items summary grouped by student (optionally scoped by matchStage). */
  async summaryByStudent(matchStage) {
    return StudentInventory.aggregate([
      { $match: matchStage },
      { $lookup: { from: "studentprofiles", localField: "studentProfileId", foreignField: "_id", as: "student" } },
      { $unwind: "$student" },
      { $lookup: { from: "users", localField: "student.userId", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      { $lookup: { from: "inventoryitemtypes", localField: "itemTypeId", foreignField: "_id", as: "itemType" } },
      { $unwind: "$itemType" },
      {
        $group: {
          _id: "$studentProfileId",
          studentName: { $first: "$user.name" },
          rollNumber: { $first: "$student.rollNumber" },
          totalItems: { $sum: "$count" },
          items: {
            $push: {
              id: "$_id",
              itemTypeId: "$itemTypeId",
              itemName: "$itemType.name",
              count: "$count",
              issueDate: "$issueDate",
              status: "$status",
              condition: "$condition",
            },
          },
        },
      },
      { $sort: { rollNumber: 1 } },
    ])
  },

  /** Issued-items summary grouped by item type (optionally scoped by matchStage). */
  async summaryByItemType(matchStage) {
    return StudentInventory.aggregate([
      { $match: matchStage },
      { $lookup: { from: "inventoryitemtypes", localField: "itemTypeId", foreignField: "_id", as: "itemType" } },
      { $unwind: "$itemType" },
      {
        $group: {
          _id: "$itemTypeId",
          itemName: { $first: "$itemType.name" },
          totalAssigned: { $sum: "$count" },
          studentCount: { $addToSet: "$studentProfileId" },
        },
      },
      {
        $project: {
          _id: 1,
          itemName: 1,
          totalAssigned: 1,
          studentCount: { $size: "$studentCount" },
        },
      },
      { $sort: { itemName: 1 } },
    ])
  },
}

export default inventoryQueries
