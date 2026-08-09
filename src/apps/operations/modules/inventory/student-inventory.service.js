/**
 * Student Inventory Service
 * Contains all business logic for student inventory operations.
 *
 * @module apps/operations/modules/inventory/student-inventory.service
 */

import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { success, notFound, badRequest } from '../../../../services/base/index.js';
import { inventoryOwner } from '../../../../services/inventory/inventoryOwner.service.js';
import { inventoryQueries } from '../../../../services/inventory/inventoryQueries.service.js';

const ENTITY = 'Student inventory';

class StudentInventoryService {
  /**
   * Assign inventory items to a student
   * @param {Object} data - Assignment data
   * @param {Object} user - Issuing user
   */
  async assignInventoryToStudent(data, user) {
    const { studentProfileId, hostelInventoryId, itemTypeId, count, condition, notes } = data;

    if (!studentProfileId || !hostelInventoryId || !itemTypeId) {
      return badRequest('Student profile ID, hostel inventory ID, and item type ID are required');
    }

    const student = await studentProfileQueries.findById(studentProfileId);
    if (!student) {
      return notFound('Student');
    }

    const hostelInventory = await inventoryQueries.findHostelInventoryById(hostelInventoryId);
    if (!hostelInventory) {
      return notFound('Hostel inventory record');
    }

    if (hostelInventory.itemTypeId.toString() !== itemTypeId) {
      return badRequest('Item type ID does not match the hostel inventory record');
    }

    const itemCount = count || 1;
    if (itemCount <= 0) {
      return badRequest('Count must be a positive number');
    }

    if (hostelInventory.availableCount < itemCount) {
      return badRequest(`Not enough items available. Only ${hostelInventory.availableCount} items available.`);
    }

    // Atomic reserve + create in one transaction (guarded $inc prevents
    // overselling the last unit under concurrent issues).
    const issue = await inventoryOwner.issueToStudent({
      studentProfileId,
      hostelInventoryId,
      itemTypeId,
      count: itemCount,
      condition: condition || 'Good',
      notes,
      issuedBy: user._id
    });

    if (!issue.ok) {
      // Raced out of stock between the check above and the atomic reserve.
      const fresh = await inventoryQueries.findHostelInventoryById(hostelInventoryId);
      return badRequest(`Not enough items available. Only ${fresh?.availableCount ?? 0} items available.`);
    }

    const populatedInventory = await inventoryQueries.findStudentInventoryByIdDetailed(issue.doc._id);
    return success(populatedInventory, 201);
  }

  /**
   * Get inventory items for a specific student
   * @param {string} studentProfileId - Student profile ID
   */
  async getStudentInventory(studentProfileId) {
    const student = await studentProfileQueries.findById(studentProfileId);
    if (!student) {
      return notFound('Student');
    }

    const inventory = await inventoryQueries.findActiveByStudent(studentProfileId);
    return success(inventory);
  }

  /**
   * Get all student inventory items with filtering
   * @param {Object} queryParams - Query parameters
   * @param {Object} user - Requesting user
   */
  async getAllStudentInventory(queryParams, user) {
    const { page = 1, limit = 10, studentProfileId, itemTypeId, hostelId, status = 'All', rollNumber, sortBy = 'issueDate', sortOrder = 'desc' } = queryParams;

    const query = {};

    if (studentProfileId) query.studentProfileId = studentProfileId;
    if (itemTypeId) query.itemTypeId = itemTypeId;
    if (status && status !== 'All') query.status = status;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    // Filter by roll number
    if (rollNumber) {
      const studentProfile = await studentProfileQueries.findByRollNumberRegexPartial(rollNumber);
      if (studentProfile) {
        query.studentProfileId = studentProfile._id;
      } else {
        return success({
          data: [],
          pagination: { totalCount: 0, totalPages: 0, currentPage: pageNum, limit: limitNum }
        });
      }
    }

    const hostel_id = user.hostel ? user.hostel._id : hostelId;

    // Filter by hostel
    if (hostel_id) {
      const hostelInventories = await inventoryQueries.findHostelInventoriesByHostel(hostel_id);
      if (hostelInventories?.length > 0) {
        query.hostelInventoryId = { $in: hostelInventories.map((hi) => hi._id) };
      } else {
        return success({
          data: [],
          pagination: { totalCount: 0, totalPages: 0, currentPage: pageNum, limit: limitNum }
        });
      }
    }

    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    const [totalCount, inventory] = await Promise.all([
      inventoryQueries.countStudentInventory(query),
      inventoryQueries.listStudentInventory(query, {
        skip: (pageNum - 1) * limitNum,
        limit: limitNum,
        sort: { [sortBy]: sortDirection },
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
   * Return inventory items from a student
   * @param {string} id - Student inventory ID
   * @param {Object} data - Return data
   * @param {Object} user - Returning user
   */
  async returnStudentInventory(id, data, user) {
    const { condition, notes } = data;

    const studentInventory = await inventoryQueries.findStudentInventoryById(id);
    if (!studentInventory) {
      return notFound(ENTITY);
    }

    if (studentInventory.status === 'Returned') {
      return badRequest('This item has already been returned');
    }

    // Flip to Returned and release the stock back atomically (one transaction).
    await inventoryOwner.returnFromStudent(studentInventory, (si) => {
      si.status = 'Returned';
      si.returnDate = new Date();
      si.returnedBy = user._id;
      if (condition) si.condition = condition;
      if (notes) si.notes = notes;
    });

    const populatedInventory = await inventoryQueries.findStudentInventoryByIdDetailed(id);
    return success(populatedInventory);
  }

  /**
   * Update inventory item status
   * @param {string} id - Student inventory ID
   * @param {Object} data - Status data
   */
  async updateInventoryStatus(id, data) {
    const { status, condition, notes } = data;

    if (!status || !['Damaged', 'Lost', 'Issued'].includes(status)) {
      return badRequest('Valid status (Damaged, Lost, or Issued) is required');
    }

    if (!condition || !['Excellent', 'Good', 'Fair', 'Poor'].includes(condition)) {
      return badRequest('Valid condition (Excellent, Good, Fair, or Poor) is required');
    }

    const studentInventory = await inventoryQueries.findStudentInventoryById(id);
    if (!studentInventory) {
      return notFound(ENTITY);
    }

    if (studentInventory.status === 'Returned') {
      return badRequest('Cannot update status of returned items');
    }

    studentInventory.status = status;
    if (condition) studentInventory.condition = condition;
    if (notes) studentInventory.notes = notes;
    await inventoryOwner.persistStudentInventory(studentInventory);

    const populatedInventory = await inventoryQueries.findStudentInventoryByIdDetailed(id);
    return success(populatedInventory);
  }

  /**
   * Get inventory summary grouped by student
   * @param {string} hostelId - Optional hostel ID filter
   */
  async getInventorySummaryByStudent(hostelId) {
    const matchStage = { status: 'Issued' };

    if (hostelId) {
      const hostelInventories = await inventoryQueries.findHostelInventoriesByHostel(hostelId);
      if (hostelInventories?.length > 0) {
        matchStage.hostelInventoryId = { $in: hostelInventories.map((hi) => hi._id) };
      } else {
        return success([]);
      }
    }

    const summary = await inventoryQueries.summaryByStudent(matchStage);
    return success(summary);
  }

  /**
   * Get inventory summary grouped by item type
   * @param {string} hostelId - Optional hostel ID filter
   */
  async getInventorySummaryByItemType(hostelId) {
    const matchStage = { status: 'Issued' };

    if (hostelId) {
      const hostelInventories = await inventoryQueries.findHostelInventoriesByHostel(hostelId);
      if (hostelInventories?.length > 0) {
        matchStage.hostelInventoryId = { $in: hostelInventories.map((hi) => hi._id) };
      } else {
        return success([]);
      }
    }

    const summary = await inventoryQueries.summaryByItemType(matchStage);
    return success(summary);
  }
}

export const studentInventoryService = new StudentInventoryService();
export default studentInventoryService;
