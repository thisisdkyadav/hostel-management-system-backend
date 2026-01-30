/**
 * Inventory Item Type Service
 * Handles inventory item type operations
 * 
 * @module services/inventoryItemType.service
 */

import InventoryItemType from '../../models/InventoryItemType.js';
import { BaseService, success, badRequest, notFound, conflict, error } from './base/index.js';

class InventoryItemTypeService extends BaseService {
  constructor() {
    super(InventoryItemType, 'Inventory item type');
  }

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
    const existing = await this.model.findOne({ name });
    if (existing) {
      return conflict('Inventory item type already exists');
    }

    const result = await this.create({
      name,
      description,
      totalCount: totalCount || 0
    });

    if (result.success) {
      return success(result.data, 201);
    }
    return result;
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

    const result = await this.findPaginated(queryObj, {
      page,
      limit,
      sort: { name: 1 }
    });

    if (result.success) {
      return success({
        data: result.data.items,
        pagination: {
          totalCount: result.data.pagination.total,
          totalPages: result.data.pagination.totalPages,
          currentPage: result.data.pagination.page,
          limit: result.data.pagination.limit
        }
      });
    }
    return result;
  }

  /**
   * Get inventory item type by ID
   * @param {string} id - Item type ID
   */
  async getInventoryItemTypeById(id) {
    return this.findById(id);
  }

  /**
   * Update inventory item type
   * @param {string} id - Item type ID
   * @param {Object} data - Update data
   */
  async updateInventoryItemType(id, data) {
    const { name, description, totalCount } = data;

    const itemType = await this.model.findById(id);
    if (!itemType) {
      return notFound(this.entityName);
    }

    // Check name uniqueness if changing
    if (name && name !== itemType.name) {
      const existing = await this.model.findOne({ name });
      if (existing) {
        return badRequest('An inventory item type with this name already exists');
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (totalCount !== undefined) updateData.totalCount = totalCount;

    return this.updateById(id, updateData);
  }

  /**
   * Delete inventory item type
   * @param {string} id - Item type ID
   */
  async deleteInventoryItemType(id) {
    try {
      const itemType = await this.model.findById(id);
      if (!itemType) {
        return notFound(this.entityName);
      }

      // Check usage in hostel inventory
      const HostelInventory = (await import('../../models/HostelInventory.js')).default;
      const hostelCount = await HostelInventory.countDocuments({ itemTypeId: id });
      if (hostelCount > 0) {
        return badRequest('Cannot delete inventory item type that is assigned to hostels');
      }

      // Check usage in student inventory
      const StudentInventory = (await import('../../models/StudentInventory.js')).default;
      const studentCount = await StudentInventory.countDocuments({ itemTypeId: id });
      if (studentCount > 0) {
        return badRequest('Cannot delete inventory item type that is assigned to students');
      }

      const result = await this.deleteById(id);
      if (result.success) {
        return success({ message: 'Inventory item type removed' });
      }
      return result;
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

    return this.updateById(id, { totalCount });
  }
}

export const inventoryItemTypeService = new InventoryItemTypeService();
