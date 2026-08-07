/**
 * Hostel Inventory Service
 * Contains all business logic for hostel inventory operations.
 *
 * @module apps/operations/modules/inventory/hostel-inventory.service
 */

import { success, notFound, badRequest } from '../../../../services/base/index.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';
import { inventoryOwner } from '../../../../services/inventory/inventoryOwner.service.js';
import { inventoryQueries } from '../../../../services/inventory/inventoryQueries.service.js';

class HostelInventoryService {
  /**
   * Assign inventory items to a hostel
   * @param {Object} params - Assignment parameters
   */
  async assignInventoryToHostel({ hostelId, itemTypeId, allocatedCount }) {
    if (!hostelId || !itemTypeId || allocatedCount === undefined) {
      return badRequest('Hostel ID, item type ID, and allocated count are required');
    }

    const hostel = await hostelQueries.findHostelById(hostelId);
    if (!hostel) {
      return notFound('Hostel');
    }

    const itemType = await inventoryQueries.findItemTypeById(itemTypeId);
    if (!itemType) {
      return notFound('Inventory item type');
    }

    if (allocatedCount < 0) {
      return badRequest('Allocated count must be a positive number');
    }

    const totalAllocated = await inventoryQueries.sumAllocatedByItemType(itemTypeId);

    const existingAllocation = await inventoryQueries.findByHostelAndItemType(hostelId, itemTypeId);
    const currentAllocation = existingAllocation ? existingAllocation.allocatedCount : 0;
    const additionalAllocation = allocatedCount - currentAllocation;

    if (totalAllocated + additionalAllocation > itemType.totalCount) {
      return badRequest(`Cannot allocate ${allocatedCount} items. Only ${itemType.totalCount - totalAllocated + currentAllocation} available globally.`);
    }

    let hostelInventory;
    if (existingAllocation) {
      // Atomic: set new allocatedCount, $inc availableCount by the delta so a
      // concurrent student issue can't clobber availableCount.
      hostelInventory = await inventoryOwner.adjustHostelAllocation(existingAllocation._id, {
        newAllocatedCount: allocatedCount,
        availableDelta: additionalAllocation,
      });
    } else {
      hostelInventory = await inventoryOwner.createHostelAllocation({
        hostelId,
        itemTypeId,
        allocatedCount,
      });
    }

    return success(hostelInventory, 201);
  }

  /**
   * Get inventory items for a specific hostel
   * @param {string} hostelId - Hostel ID
   */
  async getHostelInventory(hostelId) {
    const hostel = await hostelQueries.findHostelById(hostelId);
    if (!hostel) {
      return notFound('Hostel');
    }

    const inventory = await inventoryQueries.findByHostelPopulated(hostelId);
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

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const [totalCount, inventory] = await Promise.all([
      inventoryQueries.countHostelInventory(query),
      inventoryQueries.listHostelInventory(query, {
        skip: (pageNum - 1) * limitNum,
        limit: limitNum,
      }),
    ]);

    return success({
      data: inventory,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum,
        limit: limitNum
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

    const hostelInventory = await inventoryQueries.findHostelInventoryById(id);
    if (!hostelInventory) {
      return notFound('Hostel inventory record');
    }

    const itemType = await inventoryQueries.findItemTypeById(hostelInventory.itemTypeId);
    if (!itemType) {
      return notFound('Inventory item type');
    }

    const totalAllocatedElsewhere = await inventoryQueries.sumAllocatedByItemType(
      hostelInventory.itemTypeId,
      { excludeId: id }
    );

    if (totalAllocatedElsewhere + allocatedCount > itemType.totalCount) {
      return badRequest(`Cannot allocate ${allocatedCount} items. Only ${itemType.totalCount - totalAllocatedElsewhere} available globally.`);
    }

    const itemsInUse = hostelInventory.allocatedCount - hostelInventory.availableCount;

    if (allocatedCount < itemsInUse) {
      return badRequest(`Cannot reduce allocation below ${itemsInUse} as these items are currently assigned to students.`);
    }

    // Atomic: newAvailable - oldAvailable == newAllocated - oldAllocated, so
    // apply that delta with $inc (correct against concurrent issues) while
    // setting the new allocatedCount.
    const updatedHostelInventory = await inventoryOwner.adjustHostelAllocation(id, {
      newAllocatedCount: allocatedCount,
      availableDelta: allocatedCount - hostelInventory.allocatedCount,
    });
    return success(updatedHostelInventory);
  }

  /**
   * Delete hostel inventory allocation
   * @param {string} id - Hostel inventory ID
   */
  async deleteHostelInventory(id) {
    const hostelInventory = await inventoryQueries.findHostelInventoryById(id);
    if (!hostelInventory) {
      return notFound('Hostel inventory record');
    }

    const itemsInUse = hostelInventory.allocatedCount - hostelInventory.availableCount;
    if (itemsInUse > 0) {
      return badRequest(`Cannot delete allocation as ${itemsInUse} items are currently assigned to students.`);
    }

    await inventoryOwner.deleteHostelAllocationById(id);
    return success({ message: 'Hostel inventory allocation removed' });
  }

  /**
   * Get inventory summary by hostel
   */
  async getInventorySummaryByHostel() {
    const summary = await inventoryQueries.getInventorySummaryByHostel();
    return success(summary);
  }
}

export const hostelInventoryService = new HostelInventoryService();
export default hostelInventoryService;
