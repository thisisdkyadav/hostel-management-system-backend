/**
 * Stats Service
 * Contains all business logic for statistics operations.
 * 
 * @module services/stats
 */

import Hostel from '../../models/Hostel.js';
import Warden from '../../models/Warden.js';
import Complaint from '../../models/Complaint.js';
import Event from '../../models/Event.js';
import LostAndFound from '../../models/LostAndFound.js';
import Security from '../../models/Security.js';
import MaintenanceStaff from '../../models/MaintenanceStaff.js';
import Room from '../../models/Room.js';
import RoomChangeRequest from '../../models/RoomChangeRequest.js';
import Visitors from '../../models/Visitors.js';

class StatsService {
  /**
   * Get hostel statistics
   */
  async getHostelStats() {
    const [totalHostels, roomStats] = await Promise.all([
      Hostel.countDocuments(),
      Room.aggregate([
        { $match: { status: 'Active' } },
        {
          $group: {
            _id: null,
            totalRooms: { $sum: 1 },
            occupiedRooms: {
              $sum: { $cond: [{ $gt: ['$occupancy', 0] }, 1, 0] },
            },
            availableRooms: {
              $sum: { $cond: [{ $eq: ['$occupancy', 0] }, 1, 0] },
            },
          },
        },
      ]),
    ]);

    let stats = {
      totalRooms: 0,
      occupiedRooms: 0,
      availableRooms: 0,
      occupancyRate: 0,
    };

    if (roomStats.length > 0) {
      const { totalRooms, occupiedRooms, availableRooms } = roomStats[0];
      stats = {
        totalRooms,
        occupiedRooms,
        availableRooms,
        occupancyRate: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0,
      };
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        totalHostels,
        totalRooms: stats.totalRooms,
        occupancyRate: stats.occupancyRate,
        availableRooms: stats.availableRooms,
      },
    };
  }

  /**
   * Get warden statistics
   */
  async getWardenStats() {
    const totalWardens = await Warden.countDocuments();
    const assignedWardens = await Warden.countDocuments({ status: 'assigned' });
    const unassignedWardens = await Warden.countDocuments({ status: 'unassigned' });

    return {
      success: true,
      statusCode: 200,
      data: {
        total: totalWardens,
        assigned: assignedWardens,
        unassigned: unassignedWardens,
      },
    };
  }

  /**
   * Get event statistics for a hostel
   */
  async getEventStats(hostelId) {
    const currentDate = new Date();
    const totalEvents = await Event.countDocuments({ hostelId });
    const upcomingEvents = await Event.countDocuments({ dateAndTime: { $gt: currentDate }, hostelId });
    const pastEvents = await Event.countDocuments({ dateAndTime: { $lte: currentDate }, hostelId });

    return {
      success: true,
      statusCode: 200,
      data: {
        total: totalEvents,
        upcoming: upcomingEvents,
        past: pastEvents,
      },
    };
  }

  /**
   * Get lost and found statistics
   */
  async getLostAndFoundStats() {
    const totalLostAndFound = await LostAndFound.countDocuments();
    const activeLostAndFound = await LostAndFound.countDocuments({ status: 'Active' });
    const claimedLostAndFound = await LostAndFound.countDocuments({ status: 'Claimed' });

    return {
      success: true,
      statusCode: 200,
      data: {
        total: totalLostAndFound,
        active: activeLostAndFound,
        claimed: claimedLostAndFound,
      },
    };
  }

  /**
   * Get security staff statistics
   */
  async getSecurityStaffStats() {
    const totalSecurityStaff = await Security.countDocuments();
    const assignedSecurityStaff = await Security.countDocuments({ hostelId: { $ne: null } });
    const unassignedSecurityStaff = await Security.countDocuments({ hostelId: null });

    return {
      success: true,
      statusCode: 200,
      data: {
        total: totalSecurityStaff,
        assigned: assignedSecurityStaff,
        unassigned: unassignedSecurityStaff,
      },
    };
  }

  /**
   * Get maintenance staff statistics
   */
  async getMaintenanceStaffStats() {
    const totalMaintenanceStaff = await MaintenanceStaff.countDocuments();
    const plumbingStaff = await MaintenanceStaff.countDocuments({ category: 'Plumbing' });
    const electricalStaff = await MaintenanceStaff.countDocuments({ category: 'Electrical' });
    const cleanlinessStaff = await MaintenanceStaff.countDocuments({ category: 'Cleanliness' });
    const internetStaff = await MaintenanceStaff.countDocuments({ category: 'Internet' });
    const civilStaff = await MaintenanceStaff.countDocuments({ category: 'Civil' });

    return {
      success: true,
      statusCode: 200,
      data: {
        total: totalMaintenanceStaff,
        plumbing: plumbingStaff,
        electrical: electricalStaff,
        cleanliness: cleanlinessStaff,
        internet: internetStaff,
        civil: civilStaff,
      },
    };
  }

  /**
   * Get room statistics for a hostel
   */
  async getRoomStats(hostelId) {
    const totalRooms = await Room.countDocuments({ hostelId });
    const availableRooms = await Room.countDocuments({ occupancy: 0, hostelId });
    const occupiedRooms = await Room.countDocuments({ occupancy: { $gt: 0 }, hostelId });

    return {
      success: true,
      statusCode: 200,
      data: {
        totalRooms,
        availableRooms,
        occupiedRooms,
      },
    };
  }

  /**
   * Get room change request statistics for a hostel
   */
  async getRoomChangeRequestStats(hostelId) {
    const totalRoomChangeRequests = await RoomChangeRequest.countDocuments({ hostelId });
    const pendingRoomChangeRequests = await RoomChangeRequest.countDocuments({ status: 'Pending', hostelId });
    const approvedRoomChangeRequests = await RoomChangeRequest.countDocuments({ status: 'Approved', hostelId });
    const rejectedRoomChangeRequests = await RoomChangeRequest.countDocuments({ status: 'Rejected', hostelId });

    return {
      success: true,
      statusCode: 200,
      data: {
        total: totalRoomChangeRequests,
        pending: pendingRoomChangeRequests,
        approved: approvedRoomChangeRequests,
        rejected: rejectedRoomChangeRequests,
      },
    };
  }

  /**
   * Get visitor statistics for a hostel
   */
  async getVisitorStats(hostelId) {
    const currentDate = new Date();
    const totalVisitors = await Visitors.countDocuments({ hostelId });
    const checkedInVisitors = await Visitors.countDocuments({ status: 'Checked In', hostelId });
    const checkedOutVisitors = await Visitors.countDocuments({ status: 'Checked Out', hostelId });
    const todaysVisitors = await Visitors.countDocuments({
      hostelId,
      checkIn: { $gte: new Date(currentDate.setHours(0, 0, 0, 0)) },
      checkIn: { $lt: new Date(currentDate.setHours(23, 59, 59, 999)) },
    });

    return {
      success: true,
      statusCode: 200,
      data: {
        total: totalVisitors,
        checkedIn: checkedInVisitors,
        checkedOut: checkedOutVisitors,
        todays: todaysVisitors,
      },
    };
  }

  /**
   * Get complaint statistics
   */
  async getComplaintsStats() {
    const totalComplaints = await Complaint.countDocuments();
    const pendingComplaints = await Complaint.countDocuments({ status: 'Pending' });
    const resolvedComplaints = await Complaint.countDocuments({ status: 'Resolved' });
    const inProgressComplaints = await Complaint.countDocuments({ status: 'In Progress' });

    return {
      success: true,
      statusCode: 200,
      data: {
        total: totalComplaints,
        pending: pendingComplaints,
        resolved: resolvedComplaints,
        inProgress: inProgressComplaints,
      },
    };
  }
}

export const statsService = new StatsService();
export default statsService;
