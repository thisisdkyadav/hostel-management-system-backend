/**
 * Hostel Inventory Service
 * Contains all business logic for hostel inventory operations.
 * 
 * @module services/hostelInventory
 */

import { HostelInventory } from '../../../models/index.js';
import { InventoryItemType } from '../../../models/index.js';
import { Hostel } from '../../../models/index.js';
import mongoose from 'mongoose';
import { BaseService, success, notFound, badRequest } from '../../../services/base/index.js';

class HostelInventoryService extends BaseService {
  constructor() {
    super(HostelInventory, 'Hostel inventory');
  }

  /**
   * Assign inventory items to a hostel
   * @param {Object} params - Assignment parameters
   */
  async assignInventoryToHostel({ hostelId, itemTypeId, allocatedCount }) {
    if (!hostelId || !itemTypeId || allocatedCount === undefined) {
      return badRequest('Hostel ID, item type ID, and allocated count are required');
    }

    const hostel = await Hostel.findById(hostelId);
    if (!hostel) {
      return notFound('Hostel');
    }

    const itemType = await InventoryItemType.findById(itemTypeId);
    if (!itemType) {
      return notFound('Inventory item type');
    }

    if (allocatedCount < 0) {
      return badRequest('Allocated count must be a positive number');
    }

    const existingAllocations = await this.model.aggregate([
      { $match: { itemTypeId: new mongoose.Types.ObjectId(itemTypeId) } },
      { $group: { _id: null, totalAllocated: { $sum: '$allocatedCount' } } }
    ]);

    const totalAllocated = existingAllocations.length > 0 ? existingAllocations[0].totalAllocated : 0;

    const existingAllocation = await this.model.findOne({ hostelId, itemTypeId });
    const currentAllocation = existingAllocation ? existingAllocation.allocatedCount : 0;
    const additionalAllocation = allocatedCount - currentAllocation;

    if (totalAllocated + additionalAllocation > itemType.totalCount) {
      return badRequest(`Cannot allocate ${allocatedCount} items. Only ${itemType.totalCount - totalAllocated + currentAllocation} available globally.`);
    }

    let hostelInventory;
    if (existingAllocation) {
      existingAllocation.allocatedCount = allocatedCount;
      existingAllocation.availableCount = existingAllocation.availableCount + additionalAllocation;
      hostelInventory = await existingAllocation.save();
    } else {
      hostelInventory = await this.model.create({
        hostelId,
        itemTypeId,
        allocatedCount,
        availableCount: allocatedCount
      });
    }

    return success(hostelInventory, 201);
  }

  /**
   * Get inventory items for a specific hostel
   * @param {string} hostelId - Hostel ID
   */
  async getHostelInventory(hostelId) {
    const hostel = await Hostel.findById(hostelId);
    if (!hostel) {
      return notFound('Hostel');
    }

    const inventory = await this.model.find({ hostelId })
      .populate('itemTypeId', 'name description')
      .populate('hostelId', 'name');

    return success(inventory);
  }

  /**
   * Get all hostel inventory items with pagination
   * @param {Object} user - User object
   * @param {Object} options - Query options
   */
  async getAllHostelInventory(user, { page = 1, limit = 10, hostelId, itemTypeId }) {
    const query = {};
    if (hostelId) query.hostelId = hostelId;
    if (itemTypeId) query.itemTypeId = itemTypeId;
    if (user.hostel) query.hostelId = user.hostel._id;

    const totalCount = await this.model.countDocuments(query);
    const inventory = await this.model.find(query)
      .populate('itemTypeId', 'name description')
      .populate('hostelId', 'name')
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    return success({
      data: inventory,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  }

  /**
   * Update hostel inventory allocation
   * @param {string} id - Hostel inventory ID
   * @param {Object} params - Update parameters
   */
  async updateHostelInventory(id, { allocatedCount }) {
    if (allocatedCount === undefined) {
      return badRequest('Allocated count is required');
    }

    if (allocatedCount < 0) {
      return badRequest('Allocated count must be a positive number');
    }

    const hostelInventory = await this.model.findById(id);
    if (!hostelInventory) {
      return notFound('Hostel inventory record');
    }

    const itemType = await InventoryItemType.findById(hostelInventory.itemTypeId);
    if (!itemType) {
      return notFound('Inventory item type');
    }

    const existingAllocations = await this.model.aggregate([
      {
        $match: {
          itemTypeId: hostelInventory.itemTypeId,
          _id: { $ne: new mongoose.Types.ObjectId(id) }
        }
      },
      { $group: { _id: null, totalAllocated: { $sum: '$allocatedCount' } } }
    ]);

    const totalAllocatedElsewhere = existingAllocations.length > 0 ? existingAllocations[0].totalAllocated : 0;

    if (totalAllocatedElsewhere + allocatedCount > itemType.totalCount) {
      return badRequest(`Cannot allocate ${allocatedCount} items. Only ${itemType.totalCount - totalAllocatedElsewhere} available globally.`);
    }

    const itemsInUse = hostelInventory.allocatedCount - hostelInventory.availableCount;

    if (allocatedCount < itemsInUse) {
      return badRequest(`Cannot reduce allocation below ${itemsInUse} as these items are currently assigned to students.`);
    }

    hostelInventory.allocatedCount = allocatedCount;
    hostelInventory.availableCount = allocatedCount - itemsInUse;

    const updatedHostelInventory = await hostelInventory.save();
    return success(updatedHostelInventory);
  }

  /**
   * Delete hostel inventory allocation
   * @param {string} id - Hostel inventory ID
   */
  async deleteHostelInventory(id) {
    const hostelInventory = await this.model.findById(id);
    if (!hostelInventory) {
      return notFound('Hostel inventory record');
    }

    const itemsInUse = hostelInventory.allocatedCount - hostelInventory.availableCount;
    if (itemsInUse > 0) {
      return badRequest(`Cannot delete allocation as ${itemsInUse} items are currently assigned to students.`);
    }

    await this.model.findByIdAndDelete(id);
    return success({ message: 'Hostel inventory allocation removed' });
  }

  /**
   * Get inventory summary by hostel
   */
  async getInventorySummaryByHostel() {
    const summary = await this.model.aggregate([
      {
        $lookup: {
          from: 'hostels',
          localField: 'hostelId',
          foreignField: '_id',
          as: 'hostel'
        }
      },
      { $unwind: '$hostel' },
      {
        $lookup: {
          from: 'inventoryitemtypes',
          localField: 'itemTypeId',
          foreignField: '_id',
          as: 'itemType'
        }
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
              available: '$availableCount'
            }
          }
        }
      }
    ]);

    return success(summary);
  }
}

export const hostelInventoryService = new HostelInventoryService();
export default hostelInventoryService;
