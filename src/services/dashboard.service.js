/**
 * Dashboard Service
 * Handles dashboard operations with BaseService pattern
 * @module services/dashboard
 */

import { BaseService, success, notFound, badRequest } from './base/index.js';
import { StudentProfile } from '../models/index.js';
import { Hostel } from '../models/index.js';
import { Room } from '../models/index.js';
import { Event } from '../models/index.js';
import { Complaint } from '../models/index.js';
import { Leave } from '../models/index.js';
import mongoose from 'mongoose';
import { getConfigWithDefault } from '../utils/configDefaults.js';

class DashboardService extends BaseService {
  constructor() {
    super(StudentProfile, 'Dashboard');
  }

  /**
   * Get hostler and day scholar counts by gender
   */
  async getHostlerAndDayScholarCounts() {
    const [totalBoys, totalGirls, dayScholarBoys, dayScholarGirls] = await Promise.all([
      StudentProfile.countDocuments({ gender: 'Male', status: 'Active' }),
      StudentProfile.countDocuments({ gender: 'Female', status: 'Active' }),
      StudentProfile.countDocuments({ isDayScholar: true, gender: 'Male', status: 'Active' }),
      StudentProfile.countDocuments({ isDayScholar: true, gender: 'Female', status: 'Active' })
    ]);
    
    return {
      hostler: {
        total: (totalBoys - dayScholarBoys) + (totalGirls - dayScholarGirls),
        boys: totalBoys - dayScholarBoys,
        girls: totalGirls - dayScholarGirls
      },
      dayScholar: {
        total: dayScholarBoys + dayScholarGirls,
        boys: dayScholarBoys,
        girls: dayScholarGirls
      }
    };
  }

  /**
   * Get student statistics by degree and gender
   */
  async getStudentStats(hostelId = null) {
    const pipeline = [{ $match: { status: 'Active' } }];

    if (hostelId) {
      const hostelObjectId = typeof hostelId === 'string' ? new mongoose.Types.ObjectId(hostelId) : hostelId;
      pipeline.push(
        { $lookup: { from: 'roomallocations', localField: 'currentRoomAllocation', foreignField: '_id', as: 'allocation' } },
        { $unwind: { path: '$allocation', preserveNullAndEmptyArrays: false } },
        { $match: { 'allocation.hostelId': hostelObjectId } }
      );
    }

    pipeline.push(
      { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'user' } },
      { $unwind: '$user' },
      { $group: { _id: { degree: '$degree', gender: '$gender' }, count: { $sum: 1 } } },
      { $group: { _id: '$_id.degree', genders: { $push: { gender: '$_id.gender', count: '$count' } }, total: { $sum: '$count' } } },
      { $match: { _id: { $ne: null } } }
    );

    const degreeWiseData = await StudentProfile.aggregate(pipeline);

    const degreeWise = degreeWiseData.map((degree) => ({
      degree: degree._id || 'Unknown',
      boys: degree.genders.find((g) => g.gender === 'Male')?.count || 0,
      girls: degree.genders.find((g) => g.gender === 'Female')?.count || 0,
      total: degree.total
    }));

    const genderPipeline = [{ $match: { status: 'Active' } }];

    if (hostelId) {
      const hostelObjectId = typeof hostelId === 'string' ? new mongoose.Types.ObjectId(hostelId) : hostelId;
      genderPipeline.push(
        { $lookup: { from: 'roomallocations', localField: 'currentRoomAllocation', foreignField: '_id', as: 'allocation' } },
        { $unwind: { path: '$allocation', preserveNullAndEmptyArrays: false } },
        { $match: { 'allocation.hostelId': hostelObjectId } }
      );
    }

    genderPipeline.push({ $group: { _id: '$gender', count: { $sum: 1 } } });

    const genderTotals = await StudentProfile.aggregate(genderPipeline);
    const totalBoys = genderTotals.find((g) => g._id === 'Male')?.count || 0;
    const totalGirls = genderTotals.find((g) => g._id === 'Female')?.count || 0;

    const registeredStudents = await getConfigWithDefault('registeredStudents');
    const existingDegrees = new Map(degreeWise.map((d) => [d.degree, d]));

    degreeWise.forEach((degree) => {
      const registeredData = registeredStudents.value[degree.degree];
      degree.registeredStudents = registeredData?.total || 0;
      degree.registered = registeredData || { total: 0, boys: 0, girls: 0 };
    });

    Object.keys(registeredStudents.value).forEach((degreeName) => {
      const registeredData = registeredStudents.value[degreeName];
      if (!existingDegrees.has(degreeName) && registeredData?.total > 0) {
        degreeWise.push({
          degree: degreeName,
          boys: 0,
          girls: 0,
          total: 0,
          registeredStudents: registeredData.total,
          registered: registeredData
        });
      }
    });

    const totalRegisteredStudents = Object.values(registeredStudents.value)
      .reduce((sum, d) => sum + (d.total || 0), 0);

    degreeWise.sort((a, b) => a.degree.localeCompare(b.degree));

    return {
      degreeWise,
      totalBoys,
      totalGirls,
      grandTotal: totalBoys + totalGirls,
      totalRegisteredStudents
    };
  }

  /**
   * Get hostel statistics including room and occupancy details
   */
  async getHostelStats() {
    const hostels = await Hostel.find({ isArchived: false });

    return Promise.all(hostels.map(async (hostel) => {
      const rooms = await Room.find({ hostelId: hostel._id, status: 'Active' });

      const totalRooms = rooms.length;
      const totalCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0);
      const currentOccupancy = rooms.reduce((sum, room) => sum + room.occupancy, 0);

      return {
        name: hostel.name,
        gender: hostel.gender,
        type: hostel.type,
        totalRooms,
        totalCapacity,
        currentOccupancy,
        vacantCapacity: totalCapacity - currentOccupancy
      };
    }));
  }

  /**
   * Get upcoming events
   */
  async getEvents() {
    const events = await Event.find({ dateAndTime: { $gte: new Date() } })
      .sort({ dateAndTime: 1 })
      .limit(5)
      .populate('hostelId', 'name');

    return events.map((event) => {
      const date = new Date(event.dateAndTime);
      return {
        id: event._id,
        title: event.eventName,
        description: event.description,
        date: date.toISOString().split('T')[0],
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
        location: event.hostelId?.name || 'All Hostels',
        gender: event.gender || 'All'
      };
    });
  }

  /**
   * Get complaint statistics
   */
  async getComplaintStats() {
    const [statusCounts, categoryCounts, resolvedToday, overdueCount, recentComplaints] = await Promise.all([
      Complaint.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Complaint.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Complaint.countDocuments({
        status: 'Resolved',
        resolutionDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      }),
      Complaint.countDocuments({
        status: { $nin: ['Resolved', 'Rejected'] },
        createdAt: { $lt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) }
      }),
      Complaint.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'name')
        .populate('hostelId', 'name')
        .populate('roomId', 'roomNumber')
        .populate('unitId', 'unitNumber')
    ]);

    const total = statusCounts.reduce((sum, s) => sum + s.count, 0);
    const byCategory = {};
    categoryCounts.forEach((c) => { byCategory[c._id.toLowerCase()] = c.count; });

    return {
      total,
      pending: statusCounts.find((s) => s._id === 'Pending')?.count || 0,
      inProgress: statusCounts.find((s) => s._id === 'In Progress')?.count || 0,
      resolved: statusCounts.find((s) => s._id === 'Resolved')?.count || 0,
      forwardedToIDO: statusCounts.find((s) => s._id === 'Forwarded to IDO')?.count || 0,
      resolvedToday,
      overdueCount,
      byCategory,
      recentComplaints: recentComplaints.map((c) => ({
        id: c._id,
        title: c.title,
        category: c.category,
        status: c.status,
        date: c.createdAt.toISOString().split('T')[0],
        studentName: c.userId.name,
        location: c.location || `${c.hostelId?.name || ''} ${c.unitId?.unitNumber || ''}-${c.roomId?.roomNumber || ''}`
      }))
    };
  }

  /**
   * Get users currently on leave
   */
  async getUsersOnLeave() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const leaves = await Leave.find({
      startDate: { $lte: today },
      endDate: { $gte: today },
      status: 'Approved'
    })
      .sort({ startDate: 1 })
      .populate('userId', 'name email')
      .populate('approvalBy', 'name email');

    return success({ count: leaves.length, leaves });
  }

  /**
   * Get complete dashboard data for admin
   */
  async getDashboardData() {
    const [students, hostels, events, complaints, hostlerAndDayScholarCounts, leaves] = await Promise.all([
      this.getStudentStats(),
      this.getHostelStats(),
      this.getEvents(),
      this.getComplaintStats(),
      this.getHostlerAndDayScholarCounts(),
      this.getUsersOnLeave()
    ]);

    return success({
      students,
      hostels,
      events,
      complaints,
      hostlerAndDayScholarCounts,
      leaves
    });
  }

  /**
   * Get student statistics for a user
   */
  async getStudentStatistics(hostelId = null) {
    const studentData = await this.getStudentStats(hostelId);
    return success(studentData);
  }

  /**
   * Get hostel statistics
   */
  async getHostelStatistics() {
    const hostelData = await this.getHostelStats();
    return success(hostelData);
  }

  /**
   * Get events data
   */
  async getEventsData() {
    const eventsData = await this.getEvents();
    return success(eventsData);
  }

  /**
   * Get complaints statistics
   */
  async getComplaintsStatistics() {
    const complaintsData = await this.getComplaintStats();
    return success(complaintsData);
  }

  /**
   * Get student count by gender
   */
  async getStudentCount(hostelId = null) {
    const genderPipeline = [{ $match: { status: 'Active' } }];

    if (hostelId) {
      const hostelObjectId = typeof hostelId === 'string' ? new mongoose.Types.ObjectId(hostelId) : hostelId;
      genderPipeline.push(
        { $lookup: { from: 'roomallocations', localField: 'currentRoomAllocation', foreignField: '_id', as: 'allocation' } },
        { $unwind: { path: '$allocation', preserveNullAndEmptyArrays: false } },
        { $match: { 'allocation.hostelId': hostelObjectId } }
      );
    }

    genderPipeline.push({ $group: { _id: '$gender', count: { $sum: 1 } } });

    const genderTotals = await StudentProfile.aggregate(genderPipeline);
    const totalBoys = genderTotals.find((g) => g._id === 'Male')?.count || 0;
    const totalGirls = genderTotals.find((g) => g._id === 'Female')?.count || 0;

    return success({
      count: {
        total: totalBoys + totalGirls,
        boys: totalBoys,
        girls: totalGirls
      }
    });
  }

  /**
   * Get warden's hostel statistics
   */
  async getWardenHostelStatistics(hostelId) {
    if (!hostelId) {
      return badRequest('User is not assigned to any hostel');
    }

    const hostel = await Hostel.findById(hostelId, { _id: 1, name: 1, type: 1, gender: 1, isArchived: 1 });
    if (!hostel) {
      return notFound('Hostel not found');
    }

    const [roomStats, maintenanceIssues] = await Promise.all([
      Room.aggregate([
        { $match: { hostelId: hostel._id } },
        {
          $group: {
            _id: null,
            totalRooms: { $sum: 1 },
            totalActiveRooms: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
            occupiedRoomsCount: { $sum: { $cond: [{ $gt: ['$occupancy', 0] }, 1, 0] } },
            vacantRoomsCount: { $sum: { $cond: [{ $and: [{ $eq: ['$occupancy', 0] }, { $eq: ['$status', 'Active'] }] }, 1, 0] } },
            totalCapacity: { $sum: '$capacity' },
            totalOccupancy: { $sum: '$occupancy' },
            activeRoomsCapacity: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, '$capacity', 0] } },
            activeRoomsOccupancy: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, '$occupancy', 0] } }
          }
        }
      ]),
      Complaint.countDocuments({ hostelId: hostel._id, status: { $in: ['Pending', 'In Progress'] } })
    ]);

    const stats = roomStats.length > 0 ? roomStats[0] : {
      totalRooms: 0, totalActiveRooms: 0, occupiedRoomsCount: 0, vacantRoomsCount: 0,
      totalCapacity: 0, totalOccupancy: 0, activeRoomsCapacity: 0, activeRoomsOccupancy: 0
    };

    return success({
      id: hostel._id,
      name: hostel.name,
      type: hostel.type,
      gender: hostel.gender,
      totalRooms: stats.totalRooms,
      totalActiveRooms: stats.totalActiveRooms,
      occupiedRooms: stats.occupiedRoomsCount,
      vacantRooms: stats.vacantRoomsCount,
      maintenanceIssues,
      capacity: stats.totalCapacity,
      occupancyRate: stats.activeRoomsCapacity > 0 ? Math.round((stats.activeRoomsOccupancy / stats.activeRoomsCapacity) * 100) : 0,
      activeRoomsCapacity: stats.activeRoomsCapacity,
      activeRoomsOccupancy: stats.activeRoomsOccupancy,
      isArchived: hostel.isArchived
    });
  }
}

export const dashboardService = new DashboardService();
export default dashboardService;
