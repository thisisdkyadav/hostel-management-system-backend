/**
 * Student Inventory Service
 * Contains all business logic for student inventory operations.
 * 
 * @module apps/operations/modules/inventory/student-inventory.service
 */

import { StudentInventory, HostelInventory, StudentProfile } from '../../../../models/index.js';
import { BaseService, success, notFound, badRequest } from '../../../../services/base/index.js';

class StudentInventoryService extends BaseService {
  constructor() {
    super(StudentInventory, 'Student inventory');
  }

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

    const student = await StudentProfile.findById(studentProfileId);
    if (!student) {
      return notFound('Student');
    }

    const hostelInventory = await HostelInventory.findById(hostelInventoryId);
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

    const result = await this.create({
      studentProfileId,
      hostelInventoryId,
      itemTypeId,
      count: itemCount,
      condition: condition || 'Good',
      notes,
      issuedBy: user._id
    });

    if (!result.success) return result;

    // Update hostel inventory available count
    hostelInventory.availableCount -= itemCount;
    await hostelInventory.save();

    const populatedInventory = await this.model.findById(result.data._id)
      .populate('studentProfileId', 'rollNumber')
      .populate({ path: 'studentProfileId', populate: { path: 'userId', select: 'name email' } })
      .populate('itemTypeId', 'name description')
      .populate('issuedBy', 'name');

    return success(populatedInventory, 201);
  }

  /**
   * Get inventory items for a specific student
   * @param {string} studentProfileId - Student profile ID
   */
  async getStudentInventory(studentProfileId) {
    const student = await StudentProfile.findById(studentProfileId);
    if (!student) {
      return notFound('Student');
    }

    const inventory = await this.model.find({
      studentProfileId,
      status: { $ne: 'Returned' }
    })
      .populate('itemTypeId', 'name description')
      .populate('hostelInventoryId')
      .populate('issuedBy', 'name')
      .sort({ issueDate: -1 });

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

    // Filter by roll number
    if (rollNumber) {
      const studentProfile = await StudentProfile.findOne({ rollNumber: { $regex: rollNumber, $options: 'i' } });
      if (studentProfile) {
        query.studentProfileId = studentProfile._id;
      } else {
        return success({
          data: [],
          pagination: { totalCount: 0, totalPages: 0, currentPage: parseInt(page), limit: parseInt(limit) }
        });
      }
    }

    const hostel_id = user.hostel ? user.hostel._id : hostelId;

    // Filter by hostel
    if (hostel_id) {
      const hostelInventories = await HostelInventory.find({ hostelId: hostel_id });
      if (hostelInventories?.length > 0) {
        query.hostelInventoryId = { $in: hostelInventories.map((hi) => hi._id) };
      } else {
        return success({
          data: [],
          pagination: { totalCount: 0, totalPages: 0, currentPage: parseInt(page), limit: parseInt(limit) }
        });
      }
    }

    const totalCount = await this.model.countDocuments(query);
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    const inventory = await this.model.find(query)
      .populate('itemTypeId', 'name description')
      .populate('studentProfileId', 'rollNumber')
      .populate({ path: 'studentProfileId', populate: { path: 'userId', select: 'name email' } })
      .populate('hostelInventoryId')
      .populate('issuedBy', 'name')
      .sort({ [sortBy]: sortDirection })
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
   * Return inventory items from a student
   * @param {string} id - Student inventory ID
   * @param {Object} data - Return data
   * @param {Object} user - Returning user
   */
  async returnStudentInventory(id, data, user) {
    const { condition, notes } = data;

    const studentInventory = await this.model.findById(id);
    if (!studentInventory) {
      return notFound(this.entityName);
    }

    if (studentInventory.status === 'Returned') {
      return badRequest('This item has already been returned');
    }

    // Update student inventory
    studentInventory.status = 'Returned';
    studentInventory.returnDate = new Date();
    studentInventory.returnedBy = user._id;
    if (condition) studentInventory.condition = condition;
    if (notes) studentInventory.notes = notes;
    await studentInventory.save();

    // Update hostel inventory count
    const hostelInventory = await HostelInventory.findById(studentInventory.hostelInventoryId);
    if (hostelInventory) {
      hostelInventory.availableCount += studentInventory.count;
      await hostelInventory.save();
    }

    const populatedInventory = await this.model.findById(id)
      .populate('itemTypeId', 'name description')
      .populate('studentProfileId', 'rollNumber')
      .populate({ path: 'studentProfileId', populate: { path: 'userId', select: 'name email' } })
      .populate('issuedBy', 'name')
      .populate('returnedBy', 'name');

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

    const studentInventory = await this.model.findById(id);
    if (!studentInventory) {
      return notFound(this.entityName);
    }

    if (studentInventory.status === 'Returned') {
      return badRequest('Cannot update status of returned items');
    }

    studentInventory.status = status;
    if (condition) studentInventory.condition = condition;
    if (notes) studentInventory.notes = notes;
    await studentInventory.save();

    const populatedInventory = await this.model.findById(id)
      .populate('itemTypeId', 'name description')
      .populate('studentProfileId', 'rollNumber')
      .populate({ path: 'studentProfileId', populate: { path: 'userId', select: 'name email' } })
      .populate('issuedBy', 'name');

    return success(populatedInventory);
  }

  /**
   * Get inventory summary grouped by student
   * @param {string} hostelId - Optional hostel ID filter
   */
  async getInventorySummaryByStudent(hostelId) {
    const matchStage = { status: 'Issued' };

    if (hostelId) {
      const hostelInventories = await HostelInventory.find({ hostelId });
      if (hostelInventories?.length > 0) {
        matchStage.hostelInventoryId = { $in: hostelInventories.map((hi) => hi._id) };
      } else {
        return success([]);
      }
    }

    const summary = await this.model.aggregate([
      { $match: matchStage },
      { $lookup: { from: 'studentprofiles', localField: 'studentProfileId', foreignField: '_id', as: 'student' } },
      { $unwind: '$student' },
      { $lookup: { from: 'users', localField: 'student.userId', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $lookup: { from: 'inventoryitemtypes', localField: 'itemTypeId', foreignField: '_id', as: 'itemType' } },
      { $unwind: '$itemType' },
      {
        $group: {
          _id: '$studentProfileId',
          studentName: { $first: '$user.name' },
          rollNumber: { $first: '$student.rollNumber' },
          totalItems: { $sum: '$count' },
          items: {
            $push: {
              id: '$_id',
              itemTypeId: '$itemTypeId',
              itemName: '$itemType.name',
              count: '$count',
              issueDate: '$issueDate',
              status: '$status',
              condition: '$condition'
            }
          }
        }
      },
      { $sort: { rollNumber: 1 } }
    ]);

    return success(summary);
  }

  /**
   * Get inventory summary grouped by item type
   * @param {string} hostelId - Optional hostel ID filter
   */
  async getInventorySummaryByItemType(hostelId) {
    const matchStage = { status: 'Issued' };

    if (hostelId) {
      const hostelInventories = await HostelInventory.find({ hostelId });
      if (hostelInventories?.length > 0) {
        matchStage.hostelInventoryId = { $in: hostelInventories.map((hi) => hi._id) };
      } else {
        return success([]);
      }
    }

    const summary = await this.model.aggregate([
      { $match: matchStage },
      { $lookup: { from: 'inventoryitemtypes', localField: 'itemTypeId', foreignField: '_id', as: 'itemType' } },
      { $unwind: '$itemType' },
      {
        $group: {
          _id: '$itemTypeId',
          itemName: { $first: '$itemType.name' },
          totalAssigned: { $sum: '$count' },
          studentCount: { $addToSet: '$studentProfileId' }
        }
      },
      {
        $project: {
          _id: 1,
          itemName: 1,
          totalAssigned: 1,
          studentCount: { $size: '$studentCount' }
        }
      },
      { $sort: { itemName: 1 } }
    ]);

    return success(summary);
  }
}

export const studentInventoryService = new StudentInventoryService();
export default studentInventoryService;
