/**
 * Dashboard Service
 * Handles dashboard operations with BaseService pattern
 * @module services/dashboard
 */

import { success, notFound, badRequest } from '../../../../services/base/index.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { eventQueries } from '../../../../services/event/eventQueries.service.js';
import { complaintQueries } from '../../../../services/complaint/complaintQueries.service.js';
import { leaveQueries } from '../../../../services/leave/leaveQueries.service.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { porRequestQueries } from '../../../../services/club/porRequestQueries.service.js';
import { eventProposalQueries } from '../../../../services/gymkhana/eventProposalQueries.service.js';
import { ROLES } from '../../../../core/constants/roles.constants.js';
import mongoose from 'mongoose';

const MS_PER_DAY = 24 * 60 * 60 * 1000
const PAST_MONTH_MS = 30 * MS_PER_DAY
const PAST_YEAR_MS = 365 * MS_PER_DAY
const ADMIN_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN]
const RESOLVER_LIST_LIMIT = 5

const RATING_WINDOWS = {
  '1M': PAST_MONTH_MS,
  '1Y': PAST_YEAR_MS,
  all: null,
}

// Pending / revision statuses only. Keep local so ops dashboard does not
// import student-affairs constants. Add keys here when a new pipeline
// item joins the in-process strip.
const POR_IN_PROCESS_STATUSES = [
  'pending_gymkhana',
  'pending_club',
  'pending_gs',
  'pending_president',
  'pending_student_affairs',
  'pending_officer',
  'pending_associate_dean',
  'pending_dean',
  'revision_requested',
]

const PROPOSAL_IN_PROCESS_STATUSES = [
  'pending_president',
  'pending_student_affairs',
  'pending_officer',
  'pending_associate_dean',
  'pending_dean',
  'revision_requested',
]

// Hosteller = not a day scholar. Matches Students page filter `isDayScholar=false`:
// false, null, or field missing. Do NOT use `{ isDayScholar: false }` alone — that
// undercounts profiles where the flag was never set (legacy / incomplete imports).
const activeHostlerFilter = {
  status: 'Active',
  $or: [
    { isDayScholar: false },
    { isDayScholar: null },
    { isDayScholar: { $exists: false } },
  ],
}

const activeDayScholarFilter = {
  status: 'Active',
  isDayScholar: true,
}

class DashboardService {
  /**
   * Get hostler and day scholar counts by gender.
   * Same hosteller definition as Students page Day Scholar → Hosteller filter.
   */
  async getHostlerAndDayScholarCounts() {
    const [hostlerTotal, hostlerBoys, hostlerGirls, dayScholarTotal, dayScholarBoys, dayScholarGirls] = await Promise.all([
      studentProfileQueries.countProfiles({ ...activeHostlerFilter }),
      studentProfileQueries.countProfiles({ ...activeHostlerFilter, gender: 'Male' }),
      studentProfileQueries.countProfiles({ ...activeHostlerFilter, gender: 'Female' }),
      studentProfileQueries.countProfiles({ ...activeDayScholarFilter }),
      studentProfileQueries.countProfiles({ ...activeDayScholarFilter, gender: 'Male' }),
      studentProfileQueries.countProfiles({ ...activeDayScholarFilter, gender: 'Female' }),
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
   * Get student statistics by degree and gender.
   * Only Active students with a non-empty degree are counted; missing/blank
   * degrees are omitted (no synthetic "Unknown" row).
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
      {
        $match: {
          $expr: {
            $gt: [{ $strLenCP: { $trim: { input: { $ifNull: ['$degree', ''] } } } }, 0],
          },
        },
      },
      { $group: { _id: { degree: '$degree', gender: '$gender', isDayScholar: '$isDayScholar' }, count: { $sum: 1 } } }
    );

    const degreeRows = await studentProfileQueries.aggregateProfiles(pipeline);

    // Build per-degree hostler / day-scholar splits from the isDayScholar flag.
    // Totals are summed from the same rows so they cannot include students
    // without a real degree.
    const byDegree = new Map();
    let totalBoys = 0;
    let totalGirls = 0;
    for (const row of degreeRows) {
      const degreeName = typeof row._id.degree === 'string' ? row._id.degree.trim() : '';
      if (!degreeName) continue;
      if (!byDegree.has(degreeName)) {
        byDegree.set(degreeName, { degree: degreeName, hostler: { boys: 0, girls: 0 }, dayScholar: { boys: 0, girls: 0 } });
      }
      const entry = byDegree.get(degreeName);
      const bucket = row._id.isDayScholar ? entry.dayScholar : entry.hostler;
      if (row._id.gender === 'Male') {
        bucket.boys += row.count;
        totalBoys += row.count;
      } else if (row._id.gender === 'Female') {
        bucket.girls += row.count;
        totalGirls += row.count;
      }
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
    const events = await eventQueries.findUpcomingForDashboard(5);

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

    const leaves = await leaveQueries.findActiveApprovedLeaves(today);

    return success({ count: leaves.length, leaves });
  }

  /**
   * Shape resolver aggregation rows and attach user names.
   * Admins are dropped again here in case a role changed after the rating.
   */
  async hydrateResolverRows(rows) {
    const ids = rows.map((row) => row._id).filter(Boolean)
    if (ids.length === 0) return []

    const users = await userQueries.findUsers(
      { _id: { $in: ids }, role: { $nin: ADMIN_ROLES } },
      { select: 'name email', lean: true }
    )
    const byId = new Map(users.map((user) => [String(user._id), user]))

    return rows
      .filter((row) => byId.has(String(row._id)))
      .map((row) => {
        const user = byId.get(String(row._id))
        return {
          id: String(row._id),
          name: user?.name || user?.email || 'Unknown',
          avgRating: Math.round((row.avgRating || 0) * 10) / 10,
          ratingCount: row.ratingCount || 0,
        }
      })
  }

  rankResolverRows(rows) {
    const bestRows = [...rows]
      .sort((a, b) => (b.avgRating - a.avgRating) || (b.ratingCount - a.ratingCount))
      .slice(0, RESOLVER_LIST_LIMIT)
    const leastRows = [...rows]
      .sort((a, b) => (a.avgRating - b.avgRating) || (b.ratingCount - a.ratingCount))
      .slice(0, RESOLVER_LIST_LIMIT)
    return { bestRows, leastRows }
  }

  /**
   * Best / lowest rated non-admin resolvers for 1M, 1Y, and all-time.
   * Lowest is the bottom of the window with no star-value cutoff.
   */
  async getResolverRankings() {
    const admins = await userQueries.findUsers(
      { role: { $in: ADMIN_ROLES } },
      { select: '_id', lean: true }
    )
    const excludeUserIds = admins.map((user) => user._id)
    const now = Date.now()

    const entries = await Promise.all(
      Object.entries(RATING_WINDOWS).map(async ([key, durationMs]) => {
        const since = durationMs == null ? null : new Date(now - durationMs)
        const rows = await complaintQueries.aggregateResolverRatings({ since, excludeUserIds })
        const { bestRows, leastRows } = this.rankResolverRows(rows)
        const [bestResolvers, leastRated] = await Promise.all([
          this.hydrateResolverRows(bestRows),
          this.hydrateResolverRows(leastRows),
        ])
        return [key, { bestResolvers, leastRated }]
      })
    )

    return Object.fromEntries(entries)
  }

  /**
   * Counts of items currently in an approval pipeline.
   * Append another `{ key, label, count }` entry when a new type is added.
   */
  async getInProcessItems() {
    const [por, proposals] = await Promise.all([
      porRequestQueries.countRequests({ status: { $in: POR_IN_PROCESS_STATUSES } }),
      eventProposalQueries.countProposals({
        status: { $in: PROPOSAL_IN_PROCESS_STATUSES },
        isDeleted: { $ne: true },
      }),
    ])

    return [
      { key: 'por', label: 'POR requests', count: por },
      { key: 'proposals', label: 'Event proposals', count: proposals },
    ]
  }

  /**
   * Get complete dashboard data for admin
   */
  async getDashboardData() {
    const [students, hostels, events, complaints, hostlerAndDayScholarCounts, leaves, resolverRankings, inProcess] = await Promise.all([
      this.getStudentStats(),
      this.getHostelStats(),
      this.getEvents(),
      this.getComplaintStats(),
      this.getHostlerAndDayScholarCounts(),
      this.getUsersOnLeave(),
      this.getResolverRankings(),
      this.getInProcessItems(),
    ]);

    return success({
      students,
      hostels,
      events,
      complaints,
      hostlerAndDayScholarCounts,
      leaves,
      ratings: resolverRankings,
      inProcess,
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

    const genderTotals = await studentProfileQueries.aggregateProfiles(genderPipeline);
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
