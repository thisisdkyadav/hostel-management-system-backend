/**
 * Security Service
 * Handles security/check-in-out operations with BaseService pattern
 * @module services/security
 */

import { BaseService, success, notFound, badRequest, forbidden, paginated } from './base/index.js';
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

class SecurityService extends BaseService {
  constructor() {
    super(Security, 'Security');
  }

  /**
   * Get security details for current user
   */
  async getSecurity(userId) {
    const security = await this.model.findOne({ userId })
      .populate('hostelId', 'name type')
      .exec();

    if (!security) {
      return notFound('Security not found');
    }

    return success({
      security: {
        _id: security._id,
        name: security.name,
        email: security.email,
        phone: security.phone,
        hostelId: security.hostelId,
        hostelName: security.hostelId?.name || null,
        hostelType: security.hostelId?.type || 'unit-based'
      }
    });
  }

  /**
   * Add student entry with room details
   */
  async addStudentEntry(user, { hostelId, unit, room, bed, date, time, status, reason }) {
    const studentUnit = await Unit.findOne({ unitNumber: unit, hostelId });
    if (!studentUnit) {
      return notFound('Unit not found');
    }

    const studentRoom = await Room.findOne({ unitId: studentUnit._id, hostelId, roomNumber: room });
    if (!studentRoom) {
      return notFound('Room not found');
    }

    const roomAllocation = await RoomAllocation.findOne({ roomId: studentRoom._id, bedNumber: bed })
      .populate('userId')
      .exec();

    if (!roomAllocation) {
      return notFound('Room allocation not found');
    }

    const dateAndTime = date && time ? new Date(`${date} ${time}`) : new Date();
    const isSameHostel = studentUnit.hostelId === user.hostel._id;

    const studentEntry = await CheckInOut.create({
      userId: roomAllocation.userId,
      hostelId,
      hostelName: studentUnit.hostelId.name,
      unit,
      room,
      bed,
      dateAndTime,
      isSameHostel,
      reason,
      status
    });

    const io = getIO();
    await liveCheckInOutService.emitNewEntryEvent(io, studentEntry);

    return success({ studentEntry }, 201, 'Student entry added successfully');
  }

  /**
   * Add student entry with email
   */
  async addStudentEntryWithEmail(securityUser, { email, status, reason }) {
    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (!user) {
      return notFound('User not found');
    }

    const roomAllocation = await RoomAllocation.findOne({ userId: user._id })
      .populate('roomId')
      .populate('unitId')
      .populate('hostelId');

    const isSameHostel = roomAllocation.hostelId === securityUser.hostel._id;

    const studentEntry = await CheckInOut.create({
      userId: user._id,
      status,
      hostelId: securityUser.hostel._id,
      hostelName: roomAllocation.hostelId.name,
      unit: roomAllocation.unitId.unitNumber,
      room: roomAllocation.roomId.roomNumber,
      bed: roomAllocation.bedNumber,
      isSameHostel,
      reason
    });

    const io = getIO();
    await liveCheckInOutService.emitNewEntryEvent(io, studentEntry);

    return success({ studentEntry }, 201, 'Student entry added successfully');
  }

  /**
   * Get recent entries for a hostel
   */
  async getRecentEntries(user) {
    const query = user.hostel ? { hostelId: user.hostel._id } : {};

    const recentEntries = await CheckInOut.find(query)
      .sort({ dateAndTime: -1 })
      .limit(10)
      .populate('userId', 'name email phone profileImage')
      .populate('hostelId', 'name')
      .exec();

    return success(recentEntries);
  }

  /**
   * Get student entries with filters
   */
  async getStudentEntries(user, { userId, status, date, search, page = 1, limit = 10 }) {
    const query = {};

    if (user.role === 'Student') {
      query.userId = user._id;
    }

    if (['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor'].includes(user.role)) {
      if (userId) query.userId = userId;
    }

    if (user.hostel) query.hostelId = user.hostel._id;
    if (status) query.status = status;
    if (date) query.dateAndTime = { $gte: new Date(date) };
    if (search) {
      query.$or = [
        { 'userId.name': { $regex: search, $options: 'i' } },
        { 'userId.email': { $regex: search, $options: 'i' } },
        { room: { $regex: search, $options: 'i' } },
        { unit: { $regex: search, $options: 'i' } },
        { bed: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const [totalEntries, studentEntries] = await Promise.all([
      CheckInOut.countDocuments(query),
      CheckInOut.find(query)
        .sort({ dateAndTime: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'name email phone')
        .exec()
    ]);

    return success({
      studentEntries,
      meta: { total: totalEntries, totalPages: Math.ceil(totalEntries / limit) }
    });
  }

  /**
   * Update a student entry
   */
  async updateStudentEntry(entryId, { unit, room, bed, date, time, status }) {
    const studentEntry = await CheckInOut.findById(entryId);
    if (!studentEntry) {
      return notFound('Entry not found');
    }

    studentEntry.unit = unit;
    studentEntry.room = room;
    studentEntry.bed = bed;
    studentEntry.dateAndTime = date && time ? new Date(`${date} ${time}`) : new Date();
    studentEntry.status = status;

    await studentEntry.save();

    return success({ studentEntry }, 200, 'Student entry updated successfully');
  }

  /**
   * Add a visitor
   */
  async addVisitor(userId, { name, phone, room }) {
    const security = await this.model.findOne({ userId })
      .populate('hostelId')
      .exec();

    if (!security) {
      return notFound('Security not found');
    }

    const visitor = await Visitor.create({
      hostelId: security.hostelId._id,
      name,
      phone,
      room
    });

    return success({ visitor }, 201, 'Visitor added successfully');
  }

  /**
   * Get visitors for a hostel
   */
  async getVisitors(user) {
    let hostelId;

    if (user.role === 'Security' || user.role === 'Hostel Gate') {
      const security = await this.model.findOne({ userId: user._id });
      hostelId = security?.hostelId;
    } else if (user.role === 'Warden') {
      const warden = await Warden.findOne({ userId: user._id });
      hostelId = warden?.activeHostelId;
    } else if (user.role === 'Associate Warden') {
      const associateWarden = await AssociateWarden.findOne({ userId: user._id });
      hostelId = associateWarden?.activeHostelId;
    } else if (user.role === 'Hostel Supervisor') {
      const hostelSupervisor = await HostelSupervisor.findOne({ userId: user._id });
      hostelId = hostelSupervisor?.activeHostelId;
    } else {
      return forbidden('Access denied');
    }

    if (!hostelId) {
      return notFound('Hostel not found');
    }

    const visitors = await Visitor.find({ hostelId }).exec();
    return success(visitors);
  }

  /**
   * Update a visitor
   */
  async updateVisitor(visitorId, { name, phone, DateTime, room, status }) {
    const visitor = await Visitor.findById(visitorId);
    if (!visitor) {
      return notFound('Visitor not found');
    }

    Object.assign(visitor, { name, phone, DateTime, room, status });
    await visitor.save();

    return success({ visitor }, 200, 'Visitor updated successfully');
  }

  /**
   * Delete a student entry
   */
  async deleteStudentEntry(entryId) {
    const studentEntry = await CheckInOut.findByIdAndDelete(entryId);
    if (!studentEntry) {
      return notFound('Entry not found');
    }

    return success(null, 200, 'Student entry deleted successfully');
  }

  /**
   * Delete a visitor
   */
  async deleteVisitor(visitorId) {
    const visitor = await Visitor.findByIdAndDelete(visitorId);
    if (!visitor) {
      return notFound('Visitor not found');
    }

    return success(null, 200, 'Visitor deleted successfully');
  }

  /**
   * Verify QR code
   */
  async verifyQR(securityUser, { email, encryptedData }) {
    if (!email || !encryptedData) {
      return badRequest('Invalid QR Code');
    }

    const user = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (!user) {
      return badRequest('Invalid QR Code');
    }

    const expiry = await decryptData(encryptedData, user.aesKey);
    if (!expiry) {
      return badRequest('Invalid QR Code');
    }

    if (Date.now() > expiry) {
      return badRequest('QR Code Expired');
    }

    const studentProfile = await StudentProfile.getBasicStudentData(user._id.toString());
    if (!studentProfile) {
      return notFound('Student not found');
    }

    studentProfile.isSameHostel = studentProfile.hostel === securityUser.hostel.name;

    const lastCheckInOut = await CheckInOut.findOne({ userId: user._id })
      .sort({ dateAndTime: -1 })
      .exec();

    return success({ studentProfile, lastCheckInOut });
  }

  /**
   * Update cross-hostel reason for a student entry
   */
  async updateStudentEntryCrossHostelReason(entryId, reason) {
    const studentEntry = await CheckInOut.findByIdAndUpdate(
      entryId,
      { reason },
      { new: true }
    );

    if (!studentEntry) {
      return notFound('Entry not found');
    }

    return success({ studentEntry }, 200, 'Student entry updated successfully');
  }

  /**
   * Get face scanner entries for hostel gate
   */
  async getFaceScannerEntries(user, { limit = 20, page = 1, status }) {
    const query = user.hostel ? { hostelId: user.hostel._id } : {};
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      CheckInOut.find(query)
        .sort({ dateAndTime: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('userId', 'name email phone profileImage')
        .populate('hostelId', 'name type')
        .exec(),
      CheckInOut.countDocuments(query)
    ]);

    const pendingCrossHostelEntries = entries.filter(
      (entry) => entry.isSameHostel === false && !entry.reason && entry.status === 'Checked In'
    );

    return success({
      entries,
      pendingCrossHostelEntries,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / limit)
      }
    });
  }
}

export const securityService = new SecurityService();
export default securityService;
