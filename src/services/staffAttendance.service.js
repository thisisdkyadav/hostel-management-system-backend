/**
 * Staff Attendance Service
 * Handles staff attendance operations
 * 
 * @module services/staffAttendance.service
 */

import StaffAttendance from '../../models/staffAttendance.js';
import User from '../../models/User.js';
import Security from '../../models/Security.js';
import { decryptData } from '../../utils/qrUtils.js';
import { BaseService, success, badRequest, error } from './base/index.js';

class StaffAttendanceService extends BaseService {
  constructor() {
    super(StaffAttendance, 'Staff attendance');
  }

  /**
   * Verify staff QR code
   * @param {Object} data - QR data with email and encryptedData
   */
  async verifyQR(data) {
    const { email, encryptedData } = data;

    try {
      if (!email || !encryptedData) {
        return badRequest('Invalid QR Code data');
      }

      const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
      if (!user) {
        return badRequest('Staff not found');
      }

      if (user.role !== 'Security' && user.role !== 'Maintenance Staff') {
        return badRequest('Invalid staff type');
      }

      const expiry = await decryptData(encryptedData, user.aesKey);
      if (!expiry) {
        return badRequest('Invalid QR Code');
      }

      if (Date.now() > expiry) {
        return badRequest('QR Code Expired');
      }

      const staffType = user.role === 'Security' ? 'security' : 'maintenance';

      let staffInfo = {
        _id: user._id,
        name: user.name,
        email: user.email,
        staffType,
        role: user.role
      };

      if (staffType === 'security') {
        const securityProfile = await Security.findOne({ userId: user._id })
          .populate('hostelId', 'name type');

        if (securityProfile && securityProfile.hostelId) {
          staffInfo.hostelId = securityProfile.hostelId._id;
          staffInfo.hostelName = securityProfile.hostelId.name;
        }
      }

      const latestAttendance = await this.model.findOne({ userId: user._id })
        .sort({ createdAt: -1 });

      return success({ staffInfo, latestAttendance });
    } catch (err) {
      return error('Internal server error', 500, err.message);
    }
  }

  /**
   * Record staff attendance
   * @param {Object} data - Attendance data
   * @param {Object} reqUser - Request user
   */
  async recordAttendance(data, reqUser) {
    const { email, type } = data;

    try {
      if (!email || !type) {
        return badRequest('Missing required fields');
      }

      if (type !== 'checkIn' && type !== 'checkOut') {
        return badRequest('Invalid attendance type');
      }

      const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
      if (!user) {
        return badRequest('Staff not found');
      }

      if (user.role !== 'Security' && user.role !== 'Maintenance Staff') {
        return badRequest('Invalid staff type');
      }

      const attendance = await this.model.create({
        userId: user._id,
        hostelId: reqUser.hostel._id,
        type
      });

      return success({
        message: `Staff ${type === 'checkIn' ? 'checked in' : 'checked out'} successfully`,
        attendance
      }, 201);
    } catch (err) {
      return error('Internal server error', 500, err.message);
    }
  }

  /**
   * Get attendance records with filters
   * @param {Object} query - Query params
   * @param {Object} user - Current user
   */
  async getAttendanceRecords(query, user) {
    const { staffType, userId, hostelId, startDate, endDate, page = 1, limit = 10 } = query;

    try {
      const queryObj = {};

      if (userId) queryObj.userId = userId;
      if (hostelId) queryObj.hostelId = hostelId;

      if (staffType && !userId) {
        const users = await User.find({
          role: staffType === 'security' ? 'Security' : 'Maintenance Staff'
        }).select('_id');
        queryObj.userId = { $in: users.map((u) => u._id) };
      }

      if (startDate || endDate) {
        queryObj.createdAt = {};
        if (startDate) queryObj.createdAt.$gte = new Date(startDate);
        if (endDate) queryObj.createdAt.$lte = new Date(endDate);
      }

      if (user.hostel) {
        queryObj.hostelId = user.hostel._id;
      }

      const result = await this.findPaginated(queryObj, {
        page,
        limit,
        sort: { createdAt: -1 },
        populate: [
          { path: 'userId', select: 'name email role' },
          { path: 'hostelId', select: 'name type' }
        ]
      });

      if (result.success) {
        const { items, pagination } = result.data;
        return success({
          records: items,
          meta: {
            total: pagination.total,
            page: pagination.page,
            limit: pagination.limit,
            totalPages: pagination.totalPages
          }
        });
      }
      return result;
    } catch (err) {
      return error('Internal server error', 500, err.message);
    }
  }
}

export const staffAttendanceService = new StaffAttendanceService();
