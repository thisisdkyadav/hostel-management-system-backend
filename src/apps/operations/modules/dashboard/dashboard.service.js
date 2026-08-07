/**
 * Dashboard Service
 * Handles dashboard operations with BaseService pattern
 * @module services/dashboard
 */

import { BaseService, success, notFound, badRequest } from '../../../../services/base/index.js';
import { StudentProfile } from '../../../../models/index.js';
import { Event } from '../../../../models/index.js';
import { complaintQueries } from '../../../../services/complaint/complaintQueries.service.js';
import { Leave } from '../../../../models/index.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';
import mongoose from 'mongoose';

class DashboardService extends BaseService {
  constructor() {
    super(StudentProfile, 'Dashboard');
  }

  /**
   * Get hostler and day scholar counts by gender
   */
  async getHostlerAndDayScholarCounts() {
    const [hostlerTotal, hostlerBoys, hostlerGirls, dayScholarTotal, dayScholarBoys, dayScholarGirls] = await Promise.all([
      StudentProfile.countDocuments({ isDayScholar: false, status: 'Active' }),
      StudentProfile.countDocuments({ isDayScholar: false, gender: 'Male', status: 'Active' }),
      StudentProfile.countDocuments({ isDayScholar: false, gender: 'Female', status: 'Active' }),
      StudentProfile.countDocuments({ isDayScholar: true, status: 'Active' }),
      StudentProfile.countDocuments({ isDayScholar: true, gender: 'Male', status: 'Active' }),
      StudentProfile.countDocuments({ isDayScholar: true, gender: 'Female', status: 'Active' })
    ]);
    
    return {
      hostler: {
        total: hostlerTotal,
        boys: hostlerBoys,
        girls: hostlerGirls
      },
      dayScholar: {
        total: dayScholarTotal,
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
      { $match: { degree: { $ne: null } } },
      { $group: { _id: { degree: '$degree', gender: '$gender', isDayScholar: '$isDayScholar' }, count: { $sum: 1 } } }
    );

    const degreeRows = await StudentProfile.aggregate(pipeline);

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

    // Build per-degree hostler / day-scholar splits from the isDayScholar flag
    const byDegree = new Map();
    for (const row of degreeRows) {
      const degreeName = row._id.degree || 'Unknown';
      if (!byDegree.has(degreeName)) {
        byDegree.set(degreeName, { degree: degreeName, hostler: { boys: 0, girls: 0 }, dayScholar: { boys: 0, girls: 0 } });
      }
      const entry = byDegree.get(degreeName);
      const bucket = row._id.isDayScholar ? entry.dayScholar : entry.hostler;
      if (row._id.gender === 'Male') bucket.boys += row.count;
      else if (row._id.gender === 'Female') bucket.girls += row.count;
    }

    const degreeWise = Array.from(byDegree.values()).map((entry) => {
      const boys = entry.hostler.boys + entry.dayScholar.boys;
      const girls = entry.hostler.girls + entry.dayScholar.girls;
      return { degree: entry.degree, boys, girls, total: boys + girls, hostler: entry.hostler, dayScholar: entry.dayScholar };
    });

    degreeWise.sort((a, b) => a.degree.localeCompare(b.degree));

    return {
      degreeWise,
      totalBoys,
      totalGirls,
      grandTotal: totalBoys + totalGirls
    };
  }

  /**
   * Get hostel statistics including room and occupancy details
   */
  async getHostelStats() {
    const hostels = await hostelQueries.findActiveHostels();

    return Promise.all(hostels.map(async (hostel) => {
      const rooms = await hostelQueries.findActiveRoomsForHostel(hostel._id);

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
      complaintQueries.countGroupedBy('status'),
      complaintQueries.countGroupedBy('category'),
      complaintQueries.countComplaints({
        status: 'Resolved',
        resolutionDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      }),
      complaintQueries.countComplaints({
        status: { $nin: ['Resolved', 'Rejected'] },
        createdAt: { $lt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) }
      }),
      complaintQueries.findRecentPopulated(5)
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

    const hostel = await hostelQueries.findHostelById(hostelId);
    if (!hostel) {
      return notFound('Hostel not found');
    }

    const [roomStats, maintenanceIssues] = await Promise.all([
      hostelQueries.getRoomStatsForHostel(hostel._id),
      complaintQueries.countComplaints({ hostelId: hostel._id, status: { $in: ['Pending', 'In Progress'] } })
    ]);

    const stats = roomStats || {
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
