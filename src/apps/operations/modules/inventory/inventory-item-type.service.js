/**
 * Inventory Item Type Service
 * Handles inventory item type operations
 *
 * @module apps/operations/modules/inventory/inventory-item-type.service
 */

import {
  success,
  badRequest,
  notFound,
  conflict,
  error,
} from '../../../../services/base/index.js';
import { inventoryOwner } from '../../../../services/inventory/inventoryOwner.service.js';
import { inventoryQueries } from '../../../../services/inventory/inventoryQueries.service.js';

const ENTITY = 'Inventory item type';

class InventoryItemTypeService {
  /**
   * Create inventory item type
   * @param {Object} data - Item type data
   */
  async createInventoryItemType(data) {
    const { name, description, totalCount } = data;

    if (!name) {
      return badRequest('Name is required');
    }

    // Check if exists
    const existing = await inventoryQueries.findItemTypeByName(name);
    if (existing) {
      return conflict('Inventory item type already exists');
    }

    const created = await inventoryOwner.createItemType({
      name,
      description,
      totalCount: totalCount || 0
    });

    return success(created, 201);
  }

  /**
   * Get inventory item types with pagination
   * @param {Object} query - Query params
   */
  async getInventoryItemTypes(query) {
    const { page = 1, limit = 10, search } = query;

    const queryObj = {};
    if (search) {
      queryObj.name = { $regex: search, $options: 'i' };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const [items, totalCount] = await Promise.all([
      inventoryQueries.listItemTypes(queryObj, { skip, limit: limitNum, sort: { name: 1 } }),
      inventoryQueries.countItemTypes(queryObj),
    ]);

    return success({
      data: items,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum,
        limit: limitNum
      }
    });
  }

  /**
   * Get inventory item type by ID
   * @param {string} id - Item type ID
   */
  async getInventoryItemTypeById(id) {
    const itemType = await inventoryQueries.findItemTypeById(id);
    if (!itemType) {
      return notFound(ENTITY);
    }
    return success(itemType);
  }

  /**
   * Update inventory item type
   * @param {string} id - Item type ID
   * @param {Object} data - Update data
   */
  async updateInventoryItemType(id, data) {
    const { name, description, totalCount } = data;

    const itemType = await inventoryQueries.findItemTypeById(id);
    if (!itemType) {
      return notFound(ENTITY);
    }

    // Check name uniqueness if changing
    if (name && name !== itemType.name) {
      const existing = await inventoryQueries.findItemTypeByName(name);
      if (existing) {
        return badRequest('An inventory item type with this name already exists');
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (totalCount !== undefined) updateData.totalCount = totalCount;

    const updated = await inventoryOwner.updateItemTypeById(id, updateData);
    if (!updated) {
      return notFound(ENTITY);
    }
    return success(updated);
  }

  /**
   * Delete inventory item type
   * @param {string} id - Item type ID
   */
  async deleteInventoryItemType(id) {
    try {
      const itemType = await inventoryQueries.findItemTypeById(id);
      if (!itemType) {
        return notFound(ENTITY);
      }

      // Check usage in hostel inventory
      const hostelCount = await inventoryQueries.countHostelInventoryByItemType(id);
      if (hostelCount > 0) {
        return badRequest('Cannot delete inventory item type that is assigned to hostels');
      }

      // Check usage in student inventory
      const studentCount = await inventoryQueries.countStudentInventoryByItemType(id);
      if (studentCount > 0) {
        return badRequest('Cannot delete inventory item type that is assigned to students');
      }

      const deleted = await inventoryOwner.deleteItemTypeById(id);
      if (!deleted) {
        return notFound(ENTITY);
      }
      return success({ message: 'Inventory item type removed' });
    } catch (err) {
      return error('Server error', 500, err.message);
    }
  }

  /**
   * Update inventory item type count
   * @param {string} id - Item type ID
   * @param {Object} data - Count data
   */
  async updateInventoryItemTypeCount(id, data) {
    const { totalCount } = data;

    if (totalCount === undefined) {
      return badRequest('Total count is required');
    }

    const updated = await inventoryOwner.updateItemTypeById(id, { totalCount });
    if (!updated) {
      return notFound(ENTITY);
    }
    return success(updated);
  }
}

export const inventoryItemTypeService = new InventoryItemTypeService();
