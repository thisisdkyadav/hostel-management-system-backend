/**
 * Hostel Inventory Service
 * Contains all business logic for hostel inventory operations.
 * 
 * @module services/hostelInventory
 */

import HostelInventory from '../../models/HostelInventory.js';
import InventoryItemType from '../../models/InventoryItemType.js';
import Hostel from '../../models/Hostel.js';
import mongoose from 'mongoose';

class HostelInventoryService {
  /**
   * Assign inventory items to a hostel
   */
  async assignInventoryToHostel({ hostelId, itemTypeId, allocatedCount }) {
    if (!hostelId || !itemTypeId || allocatedCount === undefined) {
      return { success: false, statusCode: 400, message: 'Hostel ID, item type ID, and allocated count are required' };
    }

    const hostel = await Hostel.findById(hostelId);
    if (!hostel) {
      return { success: false, statusCode: 404, message: 'Hostel not found' };
    }

    const itemType = await InventoryItemType.findById(itemTypeId);
    if (!itemType) {
      return { success: false, statusCode: 404, message: 'Inventory item type not found' };
    }

    if (allocatedCount < 0) {
      return { success: false, statusCode: 400, message: 'Allocated count must be a positive number' };
    }

    const existingAllocations = await HostelInventory.aggregate([
      { $match: { itemTypeId: new mongoose.Types.ObjectId(itemTypeId) } },
      { $group: { _id: null, totalAllocated: { $sum: '$allocatedCount' } } },
    ]);

    const totalAllocated = existingAllocations.length > 0 ? existingAllocations[0].totalAllocated : 0;

    const existingAllocation = await HostelInventory.findOne({ hostelId, itemTypeId });
    const currentAllocation = existingAllocation ? existingAllocation.allocatedCount : 0;
    const additionalAllocation = allocatedCount - currentAllocation;

    if (totalAllocated + additionalAllocation > itemType.totalCount) {
      return {
        success: false,
        statusCode: 400,
        message: `Cannot allocate ${allocatedCount} items. Only ${itemType.totalCount - totalAllocated + currentAllocation} available globally.`,
      };
    }

    let hostelInventory;
    if (existingAllocation) {
      existingAllocation.allocatedCount = allocatedCount;
      existingAllocation.availableCount = existingAllocation.availableCount + additionalAllocation;
      hostelInventory = await existingAllocation.save();
    } else {
      const newHostelInventory = new HostelInventory({
        hostelId,
        itemTypeId,
        allocatedCount,
        availableCount: allocatedCount,
      });
      hostelInventory = await newHostelInventory.save();
    }

    return { success: true, statusCode: 201, data: hostelInventory };
  }

  /**
   * Get inventory items for a specific hostel
   */
  async getHostelInventory(hostelId) {
    const hostel = await Hostel.findById(hostelId);
    if (!hostel) {
      return { success: false, statusCode: 404, message: 'Hostel not found' };
    }

    const inventory = await HostelInventory.find({ hostelId })
      .populate('itemTypeId', 'name description')
      .populate('hostelId', 'name');

    return { success: true, statusCode: 200, data: inventory };
  }

  /**
   * Get all hostel inventory items with pagination
   */
  async getAllHostelInventory(user, { page = 1, limit = 10, hostelId, itemTypeId }) {
    const query = {};
    if (hostelId) query.hostelId = hostelId;
    if (itemTypeId) query.itemTypeId = itemTypeId;
    if (user.hostel) query.hostelId = user.hostel._id;

    const totalCount = await HostelInventory.countDocuments(query);
    const inventory = await HostelInventory.find(query)
      .populate('itemTypeId', 'name description')
      .populate('hostelId', 'name')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    return {
      success: true,
      statusCode: 200,
      data: {
        data: inventory,
        pagination: {
          totalCount,
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          currentPage: parseInt(page),
          limit: parseInt(limit),
        },
      },
    };
  }

  /**
   * Update hostel inventory allocation
   */
  async updateHostelInventory(id, { allocatedCount }) {
    if (allocatedCount === undefined) {
      return { success: false, statusCode: 400, message: 'Allocated count is required' };
    }

    if (allocatedCount < 0) {
      return { success: false, statusCode: 400, message: 'Allocated count must be a positive number' };
    }

    const hostelInventory = await HostelInventory.findById(id);
    if (!hostelInventory) {
      return { success: false, statusCode: 404, message: 'Hostel inventory record not found' };
    }

    const itemType = await InventoryItemType.findById(hostelInventory.itemTypeId);
    if (!itemType) {
      return { success: false, statusCode: 404, message: 'Inventory item type not found' };
    }

    const existingAllocations = await HostelInventory.aggregate([
      {
        $match: {
          itemTypeId: hostelInventory.itemTypeId,
          _id: { $ne: new mongoose.Types.ObjectId(id) },
        },
      },
      { $group: { _id: null, totalAllocated: { $sum: '$allocatedCount' } } },
    ]);

    const totalAllocatedElsewhere = existingAllocations.length > 0 ? existingAllocations[0].totalAllocated : 0;

    if (totalAllocatedElsewhere + allocatedCount > itemType.totalCount) {
      return {
        success: false,
        statusCode: 400,
        message: `Cannot allocate ${allocatedCount} items. Only ${itemType.totalCount - totalAllocatedElsewhere} available globally.`,
      };
    }

    const itemsInUse = hostelInventory.allocatedCount - hostelInventory.availableCount;

    if (allocatedCount < itemsInUse) {
      return {
        success: false,
        statusCode: 400,
        message: `Cannot reduce allocation below ${itemsInUse} as these items are currently assigned to students.`,
      };
    }

    hostelInventory.allocatedCount = allocatedCount;
    hostelInventory.availableCount = allocatedCount - itemsInUse;

    const updatedHostelInventory = await hostelInventory.save();
    return { success: true, statusCode: 200, data: updatedHostelInventory };
  }

  /**
   * Delete hostel inventory allocation
   */
  async deleteHostelInventory(id) {
    const hostelInventory = await HostelInventory.findById(id);
    if (!hostelInventory) {
      return { success: false, statusCode: 404, message: 'Hostel inventory record not found' };
    }

    const itemsInUse = hostelInventory.allocatedCount - hostelInventory.availableCount;
    if (itemsInUse > 0) {
      return {
        success: false,
        statusCode: 400,
        message: `Cannot delete allocation as ${itemsInUse} items are currently assigned to students.`,
      };
    }

    await HostelInventory.findByIdAndDelete(id);
    return { success: true, statusCode: 200, message: 'Hostel inventory allocation removed' };
  }

  /**
   * Get inventory summary by hostel
   */
  async getInventorySummaryByHostel() {
    const summary = await HostelInventory.aggregate([
      {
        $lookup: {
          from: 'hostels',
          localField: 'hostelId',
          foreignField: '_id',
          as: 'hostel',
        },
      },
      { $unwind: '$hostel' },
      {
        $lookup: {
          from: 'inventoryitemtypes',
          localField: 'itemTypeId',
          foreignField: '_id',
          as: 'itemType',
        },
      },
      { $unwind: '$itemType' },
      {
        $group: {
          _id: '$hostelId',
          hostelName: { $first: '$hostel.name' },
          totalAllocated: { $sum: '$allocatedCount' },
          totalAvailable: { $sum: '$availableCount' },
          items: {
            $push: {
              itemTypeId: '$itemTypeId',
              itemName: '$itemType.name',
              allocated: '$allocatedCount',
              available: '$availableCount',
            },
          },
        },
      },
    ]);

    return { success: true, statusCode: 200, data: summary };
  }
}

export const hostelInventoryService = new HostelInventoryService();
export default hostelInventoryService;
