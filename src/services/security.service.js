/**
 * Security Service
 * Contains all business logic for security/check-in-out operations.
 * 
 * @module services/security
 */

import Security from '../../models/Security.js';
import Warden from '../../models/Warden.js';
import Visitor from '../../models/Visitors.js';
import CheckInOut from '../../models/CheckInOut.js';
import RoomAllocation from '../../models/RoomAllocation.js';
import Unit from '../../models/Unit.js';
import Room from '../../models/Room.js';
import AssociateWarden from '../../models/AssociateWarden.js';
import HostelSupervisor from '../../models/HostelSupervisor.js';
import { decryptData } from '../../utils/qrUtils.js';
import User from '../../models/User.js';
import StudentProfile from '../../models/StudentProfile.js';
import { getIO } from '../../config/socket.js';
import * as liveCheckInOutService from '../../services/liveCheckInOutService.js';

class SecurityService {
  /**
   * Get security details for current user
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getSecurity(userId) {
    const security = await Security.findOne({ userId })
      .populate('hostelId', 'name type')
      .exec();

    if (!security) {
      return {
        success: false,
        statusCode: 404,
        message: 'Security not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        security: {
          _id: security._id,
          name: security.name,
          email: security.email,
          phone: security.phone,
          hostelId: security.hostelId,
          hostelName: security.hostelId ? security.hostelId.name : null,
          hostelType: security.hostelId ? security.hostelId.type : 'unit-based',
        },
      },
    };
  }

  /**
   * Add student entry with room details
   * @param {Object} user - Current user
   * @param {Object} entryData - Entry data
   * @returns {Object} Result object
   */
  async addStudentEntry(user, { hostelId, unit, room, bed, date, time, status, reason }) {
    const studentUnit = await Unit.findOne({ unitNumber: unit, hostelId });
    if (!studentUnit) {
      return {
        success: false,
        statusCode: 404,
        message: 'Unit not found',
      };
    }

    const studentRoom = await Room.findOne({ unitId: studentUnit._id, hostelId, roomNumber: room });
    if (!studentRoom) {
      return {
        success: false,
        statusCode: 404,
        message: 'Room not found',
      };
    }

    const roomAllocation = await RoomAllocation.findOne({
      roomId: studentRoom._id,
      bedNumber: bed,
    })
      .populate('userId')
      .exec();

    if (!roomAllocation) {
      return {
        success: false,
        statusCode: 404,
        message: 'Room allocation not found',
      };
    }

    let dateAndTime;
    if (date && time) {
      const dateTimeString = `${date} ${time}`;
      dateAndTime = new Date(dateTimeString);
    } else {
      dateAndTime = new Date();
    }

    const isSameHostel = studentUnit.hostelId === user.hostel._id;

    const studentEntry = new CheckInOut({
      userId: roomAllocation.userId,
      hostelId,
      hostelName: studentUnit.hostelId.name,
      unit,
      room,
      bed,
      dateAndTime,
      isSameHostel,
      reason,
      status,
    });

    await studentEntry.save();

    // Emit real-time event to admins using service
    const io = getIO();
    await liveCheckInOutService.emitNewEntryEvent(io, studentEntry);

    return {
      success: true,
      statusCode: 201,
      message: 'Student entry added successfully',
      data: { studentEntry },
    };
  }

  /**
   * Add student entry with email
   * @param {Object} securityUser - Security user
   * @param {Object} entryData - Entry data
   * @returns {Object} Result object
   */
  async addStudentEntryWithEmail(securityUser, { email, status, reason }) {
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (!user) {
      return {
        success: false,
        statusCode: 404,
        message: 'User not found',
      };
    }

    const roomAllocation = await RoomAllocation.findOne({ userId: user._id })
      .populate('roomId')
      .populate('unitId')
      .populate('hostelId');

    const isSameHostel = roomAllocation.hostelId === securityUser.hostel._id;

    const studentEntry = new CheckInOut({
      userId: user._id,
      status,
      hostelId: securityUser.hostel._id,
      hostelName: roomAllocation.hostelId.name,
      unit: roomAllocation.unitId.unitNumber,
      room: roomAllocation.roomId.roomNumber,
      bed: roomAllocation.bedNumber,
      isSameHostel,
      reason,
    });

    await studentEntry.save();

    // Emit real-time event to admins using service
    const io = getIO();
    await liveCheckInOutService.emitNewEntryEvent(io, studentEntry);

    return {
      success: true,
      statusCode: 201,
      message: 'Student entry added successfully',
      data: { studentEntry },
    };
  }

  /**
   * Get recent entries for a hostel
   * @param {Object} user - Current user
   * @returns {Object} Result object
   */
  async getRecentEntries(user) {
    const query = {};

    if (user.hostel) {
      query.hostelId = user.hostel._id;
    }

    const recentEntries = await CheckInOut.find(query)
      .sort({ dateAndTime: -1 })
      .limit(10)
      .populate('userId', 'name email phone profileImage')
      .populate('hostelId', 'name')
      .exec();

    return {
      success: true,
      statusCode: 200,
      data: recentEntries,
    };
  }

  /**
   * Get student entries with filters
   * @param {Object} user - Current user
   * @param {Object} filters - Query filters
   * @returns {Object} Result object
   */
  async getStudentEntries(user, { userId, status, date, search, page = 1, limit = 10 }) {
    const query = {};

    if (user.role === 'Student') {
      query.userId = user._id;
    }

    if (['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor'].includes(user.role)) {
      if (userId) {
        query.userId = userId;
      }
    }

    if (user.hostel) {
      query.hostelId = user.hostel._id;
    }

    if (status) query.status = status;
    if (date) query.dateAndTime = { $gte: new Date(date) };
    if (search) {
      query.$or = [
        { 'userId.name': { $regex: search, $options: 'i' } },
        { 'userId.email': { $regex: search, $options: 'i' } },
        { room: { $regex: search, $options: 'i' } },
        { unit: { $regex: search, $options: 'i' } },
        { bed: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (page - 1) * limit;
    const totalEntries = await CheckInOut.countDocuments(query).exec();

    const studentEntries = await CheckInOut.find(query)
      .sort({ dateAndTime: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email phone')
      .exec();

    return {
      success: true,
      statusCode: 200,
      data: {
        studentEntries,
        meta: {
          total: totalEntries,
          totalPages: Math.ceil(totalEntries / limit),
        },
      },
    };
  }

  /**
   * Update a student entry
   * @param {string} entryId - Entry ID
   * @param {Object} updateData - Update data
   * @returns {Object} Result object
   */
  async updateStudentEntry(entryId, { unit, room, bed, date, time, status }) {
    const studentEntry = await CheckInOut.findById(entryId);
    if (!studentEntry) {
      return {
        success: false,
        statusCode: 404,
        message: 'Entry not found',
      };
    }

    studentEntry.unit = unit;
    studentEntry.room = room;
    studentEntry.bed = bed;

    let dateAndTime;
    if (date && time) {
      const dateTimeString = `${date} ${time}`;
      dateAndTime = new Date(dateTimeString);
    } else {
      dateAndTime = new Date();
    }
    studentEntry.dateAndTime = dateAndTime;
    studentEntry.status = status;

    await studentEntry.save();

    return {
      success: true,
      statusCode: 200,
      message: 'Student entry updated successfully',
      data: { studentEntry },
    };
  }

  /**
   * Add a visitor
   * @param {string} userId - Current user ID
   * @param {Object} visitorData - Visitor data
   * @returns {Object} Result object
   */
  async addVisitor(userId, { name, phone, room }) {
    const security = await Security.findOne({ userId })
      .populate('hostelId')
      .exec();

    if (!security) {
      return {
        success: false,
        statusCode: 404,
        message: 'Security not found',
      };
    }

    const visitor = new Visitor({
      hostelId: security.hostelId._id,
      name,
      phone,
      room,
    });

    await visitor.save();

    return {
      success: true,
      statusCode: 201,
      message: 'Visitor added successfully',
      data: { visitor },
    };
  }

  /**
   * Get visitors for a hostel
   * @param {Object} user - Current user
   * @returns {Object} Result object
   */
  async getVisitors(user) {
    const userRole = user.role;

    let hostelId;
    if (userRole === 'Security' || userRole === 'Hostel Gate') {
      const security = await Security.findOne({ userId: user._id });
      hostelId = security.hostelId;
    } else if (userRole === 'Warden') {
      const warden = await Warden.findOne({ userId: user._id });
      hostelId = warden ? warden.activeHostelId : null;
    } else if (userRole === 'Associate Warden') {
      const associateWarden = await AssociateWarden.findOne({ userId: user._id });
      hostelId = associateWarden ? associateWarden.activeHostelId : null;
    } else if (userRole === 'Hostel Supervisor') {
      const hostelSupervisor = await HostelSupervisor.findOne({ userId: user._id });
      hostelId = hostelSupervisor ? hostelSupervisor.activeHostelId : null;
    } else {
      return {
        success: false,
        statusCode: 403,
        message: 'Access denied',
      };
    }

    if (!hostelId) {
      return {
        success: false,
        statusCode: 404,
        message: 'Hostel not found',
      };
    }

    const visitors = await Visitor.find({ hostelId }).exec();

    return {
      success: true,
      statusCode: 200,
      data: visitors,
    };
  }

  /**
   * Update a visitor
   * @param {string} visitorId - Visitor ID
   * @param {Object} updateData - Update data
   * @returns {Object} Result object
   */
  async updateVisitor(visitorId, { name, phone, DateTime, room, status }) {
    const visitor = await Visitor.findById(visitorId);
    if (!visitor) {
      return {
        success: false,
        statusCode: 404,
        message: 'Visitor not found',
      };
    }

    visitor.name = name;
    visitor.phone = phone;
    visitor.DateTime = DateTime;
    visitor.room = room;
    visitor.status = status;

    await visitor.save();

    return {
      success: true,
      statusCode: 200,
      message: 'Visitor updated successfully',
      data: { visitor },
    };
  }

  /**
   * Delete a student entry
   * @param {string} entryId - Entry ID
   * @returns {Object} Result object
   */
  async deleteStudentEntry(entryId) {
    const studentEntry = await CheckInOut.findByIdAndDelete(entryId);
    if (!studentEntry) {
      return {
        success: false,
        statusCode: 404,
        message: 'Entry not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Student entry deleted successfully',
    };
  }

  /**
   * Delete a visitor
   * @param {string} visitorId - Visitor ID
   * @returns {Object} Result object
   */
  async deleteVisitor(visitorId) {
    const visitor = await Visitor.findByIdAndDelete(visitorId);
    if (!visitor) {
      return {
        success: false,
        statusCode: 404,
        message: 'Visitor not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Visitor deleted successfully',
    };
  }

  /**
   * Verify QR code
   * @param {Object} securityUser - Security user
   * @param {Object} qrData - QR code data
   * @returns {Object} Result object
   */
  async verifyQR(securityUser, { email, encryptedData }) {
    if (!email || !encryptedData) {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid QR Code',
      };
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (!user) {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid QR Code',
      };
    }

    const expiry = await decryptData(encryptedData, user.aesKey);
    if (!expiry) {
      return {
        success: false,
        statusCode: 400,
        message: 'Invalid QR Code',
      };
    }

    if (Date.now() > expiry) {
      return {
        success: false,
        statusCode: 400,
        message: 'QR Code Expired',
      };
    }

    const studentProfile = await StudentProfile.getBasicStudentData(user._id.toString());
    if (!studentProfile) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student not found',
      };
    }

    const isSameHostel = studentProfile.hostel === securityUser.hostel.name;
    studentProfile.isSameHostel = isSameHostel;

    const lastCheckInOut = await CheckInOut.findOne({ userId: user._id })
      .sort({ dateAndTime: -1 })
      .exec();

    return {
      success: true,
      statusCode: 200,
      data: { studentProfile, lastCheckInOut },
    };
  }

  /**
   * Update cross-hostel reason for a student entry
   * @param {string} entryId - Entry ID
   * @param {string} reason - Reason
   * @returns {Object} Result object
   */
  async updateStudentEntryCrossHostelReason(entryId, reason) {
    const studentEntry = await CheckInOut.findByIdAndUpdate(
      entryId,
      { reason },
      { new: true }
    );

    if (!studentEntry) {
      return {
        success: false,
        statusCode: 404,
        message: 'Entry not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Student entry updated successfully',
      data: { studentEntry },
    };
  }

  /**
   * Get face scanner entries for hostel gate
   * @param {Object} user - Current user
   * @param {Object} options - Query options
   * @returns {Object} Result object
   */
  async getFaceScannerEntries(user, { limit = 20, page = 1, status }) {
    const query = {};

    // Filter by guard's hostel
    if (user.hostel) {
      query.hostelId = user.hostel._id;
    }

    // Optional status filter
    if (status) {
      query.status = status;
    }

    const skip = (page - 1) * limit;
    const entries = await CheckInOut.find(query)
      .sort({ dateAndTime: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('userId', 'name email phone profileImage')
      .populate('hostelId', 'name type')
      .exec();

    const total = await CheckInOut.countDocuments(query);

    // Identify pending cross-hostel entries (check-in from other hostels without reason)
    const pendingCrossHostelEntries = entries.filter(
      (entry) => entry.isSameHostel === false && !entry.reason && entry.status === 'Checked In'
    );

    return {
      success: true,
      statusCode: 200,
      data: {
        entries,
        pendingCrossHostelEntries,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }
}

export const securityService = new SecurityService();
export default securityService;
