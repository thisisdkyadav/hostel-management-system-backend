/**
 * Student Inventory Service
 * Contains all business logic for student inventory operations.
 * 
 * @module services/studentInventory
 */

import StudentInventory from '../../models/StudentInventory.js';
import HostelInventory from '../../models/HostelInventory.js';
import StudentProfile from '../../models/StudentProfile.js';

class StudentInventoryService {
  /**
   * Assign inventory items to a student
   * @param {Object} data - Assignment data
   * @param {Object} user - Issuing user
   * @returns {Object} Result object
   */
  async assignInventoryToStudent(data, user) {
    const { studentProfileId, hostelInventoryId, itemTypeId, count, condition, notes } = data;

    // Validate required fields
    if (!studentProfileId || !hostelInventoryId || !itemTypeId) {
      return {
        success: false,
        statusCode: 400,
        message: 'Student profile ID, hostel inventory ID, and item type ID are required',
      };
    }

    // Validate student exists
    const student = await StudentProfile.findById(studentProfileId);
    if (!student) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student not found',
      };
    }

    // Validate hostel inventory exists
    const hostelInventory = await HostelInventory.findById(hostelInventoryId);
    if (!hostelInventory) {
      return {
        success: false,
        statusCode: 404,
        message: 'Hostel inventory record not found',
      };
    }

    // Validate item type matches
    if (hostelInventory.itemTypeId.toString() !== itemTypeId) {
      return {
        success: false,
        statusCode: 400,
        message: 'Item type ID does not match the hostel inventory record',
      };
    }

    // Validate count
    const itemCount = count || 1;
    if (itemCount <= 0) {
      return {
        success: false,
        statusCode: 400,
        message: 'Count must be a positive number',
      };
    }

    // Check if there's enough inventory available in the hostel
    if (hostelInventory.availableCount < itemCount) {
      return {
        success: false,
        statusCode: 400,
        message: `Not enough items available. Only ${hostelInventory.availableCount} items available.`,
      };
    }

    // Create student inventory record
    const newStudentInventory = new StudentInventory({
      studentProfileId,
      hostelInventoryId,
      itemTypeId,
      count: itemCount,
      condition: condition || 'Good',
      notes,
      issuedBy: user._id,
    });

    const studentInventory = await newStudentInventory.save();

    // Update hostel inventory available count
    hostelInventory.availableCount -= itemCount;
    await hostelInventory.save();

    // Return the created record with populated data
    const populatedInventory = await StudentInventory.findById(studentInventory._id)
      .populate('studentProfileId', 'rollNumber')
      .populate({
        path: 'studentProfileId',
        populate: {
          path: 'userId',
          select: 'name email',
        },
      })
      .populate('itemTypeId', 'name description')
      .populate('issuedBy', 'name');

    return {
      success: true,
      statusCode: 201,
      data: populatedInventory,
    };
  }

  /**
   * Get inventory items for a specific student
   * @param {string} studentProfileId - Student profile ID
   * @returns {Object} Result object
   */
  async getStudentInventory(studentProfileId) {
    // Validate student exists
    const student = await StudentProfile.findById(studentProfileId);
    if (!student) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student not found',
      };
    }

    const inventory = await StudentInventory.find({
      studentProfileId,
      status: { $ne: 'Returned' }, // Only show active inventory
    })
      .populate('itemTypeId', 'name description')
      .populate('hostelInventoryId')
      .populate('issuedBy', 'name')
      .sort({ issueDate: -1 });

    return {
      success: true,
      statusCode: 200,
      data: inventory,
    };
  }

  /**
   * Get all student inventory items with filtering
   * @param {Object} queryParams - Query parameters
   * @param {Object} user - Requesting user
   * @returns {Object} Result object
   */
  async getAllStudentInventory(queryParams, user) {
    const { page = 1, limit = 10, studentProfileId, itemTypeId, hostelId, status = 'All', rollNumber, sortBy = 'issueDate', sortOrder = 'desc' } = queryParams;

    const query = {};

    if (studentProfileId) query.studentProfileId = studentProfileId;
    if (itemTypeId) query.itemTypeId = itemTypeId;
    if (status && status !== 'All') query.status = status;

    // If roll number is provided, we need to find the student profile first
    if (rollNumber) {
      const studentProfile = await StudentProfile.findOne({ rollNumber: { $regex: rollNumber, $options: 'i' } });
      if (studentProfile) {
        query.studentProfileId = studentProfile._id;
      } else {
        // If no student found with this roll number, return empty result
        return {
          success: true,
          statusCode: 200,
          data: {
            data: [],
            pagination: {
              totalCount: 0,
              totalPages: 0,
              currentPage: parseInt(page),
              limit: parseInt(limit),
            },
          },
        };
      }
    }

    const hostel_id = user.hostel ? user.hostel._id : hostelId;

    // If hostel ID is provided, we need to find related hostel inventory records
    if (hostel_id) {
      const hostelInventories = await HostelInventory.find({ hostelId: hostel_id });
      if (hostelInventories && hostelInventories.length > 0) {
        query.hostelInventoryId = { $in: hostelInventories.map((hi) => hi._id) };
      } else {
        // If no hostel inventory found for this hostel, return empty result
        return {
          success: true,
          statusCode: 200,
          data: {
            data: [],
            pagination: {
              totalCount: 0,
              totalPages: 0,
              currentPage: parseInt(page),
              limit: parseInt(limit),
            },
          },
        };
      }
    }

    const totalCount = await StudentInventory.countDocuments(query);

    // Determine sort direction
    const sortDirection = sortOrder === 'desc' ? -1 : 1;

    const inventory = await StudentInventory.find(query)
      .populate('itemTypeId', 'name description')
      .populate('studentProfileId', 'rollNumber')
      .populate({
        path: 'studentProfileId',
        populate: {
          path: 'userId',
          select: 'name email',
        },
      })
      .populate('hostelInventoryId')
      .populate('issuedBy', 'name')
      .sort({ [sortBy]: sortDirection })
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
   * Return inventory items from a student
   * @param {string} id - Student inventory ID
   * @param {Object} data - Return data
   * @param {Object} user - Returning user
   * @returns {Object} Result object
   */
  async returnStudentInventory(id, data, user) {
    const { condition, notes } = data;

    const studentInventory = await StudentInventory.findById(id);
    if (!studentInventory) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student inventory record not found',
      };
    }

    if (studentInventory.status === 'Returned') {
      return {
        success: false,
        statusCode: 400,
        message: 'This item has already been returned',
      };
    }

    // Update the student inventory record
    studentInventory.status = 'Returned';
    studentInventory.returnDate = new Date();
    studentInventory.returnedBy = user._id;

    if (condition) {
      studentInventory.condition = condition;
    }

    if (notes) {
      studentInventory.notes = notes;
    }

    await studentInventory.save();

    // Update hostel inventory available count
    const hostelInventory = await HostelInventory.findById(studentInventory.hostelInventoryId);
    if (hostelInventory) {
      hostelInventory.availableCount += studentInventory.count;
      await hostelInventory.save();
    }

    // Return the updated record with populated data
    const populatedInventory = await StudentInventory.findById(id)
      .populate('itemTypeId', 'name description')
      .populate('studentProfileId', 'rollNumber')
      .populate({
        path: 'studentProfileId',
        populate: {
          path: 'userId',
          select: 'name email',
        },
      })
      .populate('issuedBy', 'name')
      .populate('returnedBy', 'name');

    return {
      success: true,
      statusCode: 200,
      data: populatedInventory,
    };
  }

  /**
   * Update inventory item status
   * @param {string} id - Student inventory ID
   * @param {Object} data - Status data
   * @returns {Object} Result object
   */
  async updateInventoryStatus(id, data) {
    const { status, condition, notes } = data;

    if (!status || !['Damaged', 'Lost', 'Issued'].includes(status)) {
      return {
        success: false,
        statusCode: 400,
        message: 'Valid status (Damaged, Lost, or Issued) is required',
      };
    }

    if (!condition || !['Excellent', 'Good', 'Fair', 'Poor'].includes(condition)) {
      return {
        success: false,
        statusCode: 400,
        message: 'Valid condition (Excellent, Good, Fair, or Poor) is required',
      };
    }

    const studentInventory = await StudentInventory.findById(id);
    if (!studentInventory) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student inventory record not found',
      };
    }

    if (studentInventory.status === 'Returned') {
      return {
        success: false,
        statusCode: 400,
        message: 'Cannot update status of returned items',
      };
    }

    // Update the student inventory record
    studentInventory.status = status;

    if (condition) {
      studentInventory.condition = condition;
    }

    if (notes) {
      studentInventory.notes = notes;
    }

    await studentInventory.save();

    // Return the updated record with populated data
    const populatedInventory = await StudentInventory.findById(id)
      .populate('itemTypeId', 'name description')
      .populate('studentProfileId', 'rollNumber')
      .populate({
        path: 'studentProfileId',
        populate: {
          path: 'userId',
          select: 'name email',
        },
      })
      .populate('issuedBy', 'name');

    return {
      success: true,
      statusCode: 200,
      data: populatedInventory,
    };
  }

  /**
   * Get inventory summary grouped by student
   * @param {string} hostelId - Optional hostel ID filter
   * @returns {Object} Result object
   */
  async getInventorySummaryByStudent(hostelId) {
    const matchStage = { status: 'Issued' };

    // If hostel ID is provided, filter by hostel
    if (hostelId) {
      const hostelInventories = await HostelInventory.find({ hostelId });
      if (hostelInventories && hostelInventories.length > 0) {
        matchStage.hostelInventoryId = {
          $in: hostelInventories.map((hi) => hi._id),
        };
      } else {
        return {
          success: true,
          statusCode: 200,
          data: [],
        };
      }
    }

    const summary = await StudentInventory.aggregate([
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: 'studentprofiles',
          localField: 'studentProfileId',
          foreignField: '_id',
          as: 'student',
        },
      },
      {
        $unwind: '$student',
      },
      {
        $lookup: {
          from: 'users',
          localField: 'student.userId',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: '$user',
      },
      {
        $lookup: {
          from: 'inventoryitemtypes',
          localField: 'itemTypeId',
          foreignField: '_id',
          as: 'itemType',
        },
      },
      {
        $unwind: '$itemType',
      },
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
              condition: '$condition',
            },
          },
        },
      },
      {
        $sort: { rollNumber: 1 },
      },
    ]);

    return {
      success: true,
      statusCode: 200,
      data: summary,
    };
  }

  /**
   * Get inventory summary grouped by item type
   * @param {string} hostelId - Optional hostel ID filter
   * @returns {Object} Result object
   */
  async getInventorySummaryByItemType(hostelId) {
    const matchStage = { status: 'Issued' };

    // If hostel ID is provided, filter by hostel
    if (hostelId) {
      const hostelInventories = await HostelInventory.find({ hostelId });
      if (hostelInventories && hostelInventories.length > 0) {
        matchStage.hostelInventoryId = {
          $in: hostelInventories.map((hi) => hi._id),
        };
      } else {
        return {
          success: true,
          statusCode: 200,
          data: [],
        };
      }
    }

    const summary = await StudentInventory.aggregate([
      {
        $match: matchStage,
      },
      {
        $lookup: {
          from: 'inventoryitemtypes',
          localField: 'itemTypeId',
          foreignField: '_id',
          as: 'itemType',
        },
      },
      {
        $unwind: '$itemType',
      },
      {
        $group: {
          _id: '$itemTypeId',
          itemName: { $first: '$itemType.name' },
          totalAssigned: { $sum: '$count' },
          studentCount: { $addToSet: '$studentProfileId' },
        },
      },
      {
        $project: {
          _id: 1,
          itemName: 1,
          totalAssigned: 1,
          studentCount: { $size: '$studentCount' },
        },
      },
      {
        $sort: { itemName: 1 },
      },
    ]);

    return {
      success: true,
      statusCode: 200,
      data: summary,
    };
  }
}

export const studentInventoryService = new StudentInventoryService();
export default studentInventoryService;
