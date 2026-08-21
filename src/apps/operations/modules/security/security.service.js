/**
 * Security Service
 * Handles security/check-in-out operations
 * @module services/security
 */

import { success, notFound, badRequest, forbidden, paginated } from '../../../../services/base/index.js';
import { checkInOutOwner } from '../../../../services/checkinout/checkInOutOwner.service.js';
import { checkInOutQueries } from '../../../../services/checkinout/checkInOutQueries.service.js';
import { decryptData } from '../../../../utils/qrUtils.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { staffRolesQueries } from '../../../../services/user/staffRolesQueries.service.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';
import { visitorOwner } from '../../../../services/visitor/visitorOwner.service.js';
import { visitorQueries } from '../../../../services/visitor/visitorQueries.service.js';
import { getIO } from '../../../../loaders/socket.loader.js';
import * as liveCheckInOutService from '../live-checkinout/live-checkinout.service.js';

class SecurityService {
  /**
   * Get security details for current user
   */
  async getSecurity(userId) {
    const security = await staffRolesQueries.findByUserIdWithPopulate('Security', userId, {
      path: 'hostelId',
      select: 'name type',
    });

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
    const studentUnit = await hostelQueries.findUnitByNumber(hostelId, unit);
    if (!studentUnit) {
      return notFound('Unit not found');
    }

    const studentRoom = await hostelQueries.findRoomByNumber(hostelId, room, { unitId: studentUnit._id });
    if (!studentRoom) {
      return notFound('Room not found');
    }

    const roomAllocation = await hostelQueries.findAllocationByRoomAndBed(studentRoom._id, bed);

    if (!roomAllocation) {
      return notFound('Room allocation not found');
    }

    // Unit.hostelId is a bare ObjectId — resolve the name from the hostel itself.
    const hostel = await hostelQueries.findHostelById(hostelId);
    const dateAndTime = date && time ? new Date(`${date} ${time}`) : new Date();
    const isSameHostel = Boolean(
      user?.hostel?._id && String(user.hostel._id) === String(hostelId)
    );

    const studentEntry = await checkInOutOwner.createEntry({
      userId: roomAllocation.userId,
      hostelId,
      hostelName: hostel?.name || null,
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
    const user = await userQueries.findUserByEmailCI(email);
    if (!user) {
      return notFound('User not found');
    }

    const roomAllocation = await hostelQueries.findCurrentAllocationByUser(user._id);
    if (!roomAllocation) {
      return notFound('Student is not allocated to any room');
    }

    const allocationHostelId = roomAllocation.hostelId?._id || roomAllocation.hostelId;
    // Officers without a hostel assignment log against the student's hostel.
    const officerHostelId = securityUser?.hostel?._id || allocationHostelId;
    const isSameHostel = Boolean(
      officerHostelId && String(officerHostelId) === String(allocationHostelId)
    );

    const studentEntry = await checkInOutOwner.createEntry({
      userId: user._id,
      status,
      hostelId: officerHostelId,
      hostelName: roomAllocation.hostelId?.name || null,
      unit: roomAllocation.unitId?.unitNumber || null,
      room: roomAllocation.roomId?.roomNumber || null,
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

    const recentEntries = await checkInOutQueries.listRecentByHostel(query, 10);

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
      checkInOutQueries.countEntries(query),
      checkInOutQueries.listStudentEntries(query, { skip, limit })
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
    const studentEntry = await checkInOutQueries.findEntryById(entryId);
    if (!studentEntry) {
      return notFound('Entry not found');
    }

    studentEntry.unit = unit;
    studentEntry.room = room;
    studentEntry.bed = bed;
    studentEntry.dateAndTime = date && time ? new Date(`${date} ${time}`) : new Date();
    studentEntry.status = status;

    await checkInOutOwner.persistEntry(studentEntry);

    return success({ studentEntry }, 200, 'Student entry updated successfully');
  }

  /**
   * Add a visitor
   */
  async addVisitor(userId, { name, phone, room }) {
    const security = await staffRolesQueries.findByUserIdWithPopulate('Security', userId, 'hostelId');

    if (!security) {
      return notFound('Security not found');
    }

    const visitor = await visitorOwner.createVisitor({
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
      const security = await staffRolesQueries.findByUserId('Security', user._id);
      hostelId = security?.hostelId;
    } else if (user.role === 'Warden') {
      const warden = await staffRolesQueries.findByUserId('Warden', user._id);
      hostelId = warden?.activeHostelId;
    } else if (user.role === 'Associate Warden') {
      const associateWarden = await staffRolesQueries.findByUserId('AssociateWarden', user._id);
      hostelId = associateWarden?.activeHostelId;
    } else if (user.role === 'Hostel Supervisor') {
      const hostelSupervisor = await staffRolesQueries.findByUserId('HostelSupervisor', user._id);
      hostelId = hostelSupervisor?.activeHostelId;
    } else {
      return forbidden('Access denied');
    }

    if (!hostelId) {
      return notFound('Hostel not found');
    }

    const visitors = await visitorQueries.findVisitorsByHostel(hostelId);
    return success(visitors);
  }

  /**
   * Update a visitor
   */
  async updateVisitor(visitorId, { name, phone, DateTime, room, status }) {
    const visitor = await visitorQueries.findVisitorById(visitorId);
    if (!visitor) {
      return notFound('Visitor not found');
    }

    Object.assign(visitor, { name, phone, DateTime, room, status });
    await visitorOwner.persistVisitor(visitor);

    return success({ visitor }, 200, 'Visitor updated successfully');
  }

  /**
   * Delete a student entry
   */
  async deleteStudentEntry(entryId) {
    const studentEntry = await checkInOutOwner.deleteEntryById(entryId);
    if (!studentEntry) {
      return notFound('Entry not found');
    }

    return success(null, 200, 'Student entry deleted successfully');
  }

  /**
   * Delete a visitor
   */
  async deleteVisitor(visitorId) {
    const visitor = await visitorOwner.deleteVisitorById(visitorId);
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

    const user = await userQueries.findUserByEmailCI(email);
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

    const studentProfile = await studentProfileQueries.getBasicStudentData(user._id.toString());
    if (!studentProfile) {
      return notFound('Student not found');
    }

    studentProfile.isSameHostel = studentProfile.hostel === securityUser.hostel.name;

    const lastCheckInOut = await checkInOutQueries.findLastEntryByUser(user._id);

    return success({ studentProfile, lastCheckInOut });
  }

  /**
   * Update cross-hostel reason for a student entry
   */
  async updateStudentEntryCrossHostelReason(entryId, reason) {
    const studentEntry = await checkInOutOwner.updateEntryById(entryId, { reason });

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
      checkInOutQueries.listFaceScannerEntries(query, { skip, limit: parseInt(limit) }),
      checkInOutQueries.countEntries(query)
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
