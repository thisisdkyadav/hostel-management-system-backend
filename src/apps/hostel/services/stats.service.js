/**
 * Stats Service
 * Contains all business logic for statistics operations.
 * 
 * @module services/stats
 */

import { Hostel } from '../../../models/index.js';
import { Warden } from '../../../models/index.js';
import { Complaint } from '../../../models/index.js';
import { Event } from '../../../models/index.js';
import { LostAndFound } from '../../../models/index.js';
import { Security } from '../../../models/index.js';
import { MaintenanceStaff } from '../../../models/index.js';
import { Room } from '../../../models/index.js';
import { RoomChangeRequest } from '../../../models/index.js';
import { Visitors } from '../../../models/index.js';
import { success } from '../../../services/base/index.js';

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
            occupiedRooms: { $sum: { $cond: [{ $gt: ['$occupancy', 0] }, 1, 0] } },
            availableRooms: { $sum: { $cond: [{ $eq: ['$occupancy', 0] }, 1, 0] } }
          }
        }
      ])
    ]);

    let stats = { totalRooms: 0, occupiedRooms: 0, availableRooms: 0, occupancyRate: 0 };

    if (roomStats.length > 0) {
      const { totalRooms, occupiedRooms, availableRooms } = roomStats[0];
      stats = {
        totalRooms,
        occupiedRooms,
        availableRooms,
        occupancyRate: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0
      };
    }

    return success({
      totalHostels,
      totalRooms: stats.totalRooms,
      occupancyRate: stats.occupancyRate,
      availableRooms: stats.availableRooms
    });
  }

  /**
   * Get warden statistics
   */
  async getWardenStats() {
    const [total, assigned, unassigned] = await Promise.all([
      Warden.countDocuments(),
      Warden.countDocuments({ status: 'assigned' }),
      Warden.countDocuments({ status: 'unassigned' })
    ]);

    return success({ total, assigned, unassigned });
  }

  /**
   * Get event statistics for a hostel
   * @param {string} hostelId - Hostel ID
   */
  async getEventStats(hostelId) {
    const currentDate = new Date();
    const [total, upcoming, past] = await Promise.all([
      Event.countDocuments({ hostelId }),
      Event.countDocuments({ dateAndTime: { $gt: currentDate }, hostelId }),
      Event.countDocuments({ dateAndTime: { $lte: currentDate }, hostelId })
    ]);

    return success({ total, upcoming, past });
  }

  /**
   * Get lost and found statistics
   */
  async getLostAndFoundStats() {
    const [total, active, claimed] = await Promise.all([
      LostAndFound.countDocuments(),
      LostAndFound.countDocuments({ status: 'Active' }),
      LostAndFound.countDocuments({ status: 'Claimed' })
    ]);

    return success({ total, active, claimed });
  }

  /**
   * Get security staff statistics
   */
  async getSecurityStaffStats() {
    const [total, assigned, unassigned] = await Promise.all([
      Security.countDocuments(),
      Security.countDocuments({ hostelId: { $ne: null } }),
      Security.countDocuments({ hostelId: null })
    ]);

    return success({ total, assigned, unassigned });
  }

  /**
   * Get maintenance staff statistics
   */
  async getMaintenanceStaffStats() {
    const [total, plumbing, electrical, cleanliness, internet, civil] = await Promise.all([
      MaintenanceStaff.countDocuments(),
      MaintenanceStaff.countDocuments({ category: 'Plumbing' }),
      MaintenanceStaff.countDocuments({ category: 'Electrical' }),
      MaintenanceStaff.countDocuments({ category: 'Cleanliness' }),
      MaintenanceStaff.countDocuments({ category: 'Internet' }),
      MaintenanceStaff.countDocuments({ category: 'Civil' })
    ]);

    return success({ total, plumbing, electrical, cleanliness, internet, civil });
  }

  /**
   * Get room statistics for a hostel
   * @param {string} hostelId - Hostel ID
   */
  async getRoomStats(hostelId) {
    const [totalRooms, availableRooms, occupiedRooms] = await Promise.all([
      Room.countDocuments({ hostelId }),
      Room.countDocuments({ occupancy: 0, hostelId }),
      Room.countDocuments({ occupancy: { $gt: 0 }, hostelId })
    ]);

    return success({ totalRooms, availableRooms, occupiedRooms });
  }

  /**
   * Get room change request statistics for a hostel
   * @param {string} hostelId - Hostel ID
   */
  async getRoomChangeRequestStats(hostelId) {
    const [total, pending, approved, rejected] = await Promise.all([
      RoomChangeRequest.countDocuments({ hostelId }),
      RoomChangeRequest.countDocuments({ status: 'Pending', hostelId }),
      RoomChangeRequest.countDocuments({ status: 'Approved', hostelId }),
      RoomChangeRequest.countDocuments({ status: 'Rejected', hostelId })
    ]);

    return success({ total, pending, approved, rejected });
  }

  /**
   * Get visitor statistics for a hostel
   * @param {string} hostelId - Hostel ID
   */
  async getVisitorStats(hostelId) {
    const currentDate = new Date();
    const todayStart = new Date(currentDate.setHours(0, 0, 0, 0));
    const todayEnd = new Date(currentDate.setHours(23, 59, 59, 999));

    const [total, checkedIn, checkedOut, todays] = await Promise.all([
      Visitors.countDocuments({ hostelId }),
      Visitors.countDocuments({ status: 'Checked In', hostelId }),
      Visitors.countDocuments({ status: 'Checked Out', hostelId }),
      Visitors.countDocuments({ hostelId, checkIn: { $gte: todayStart, $lt: todayEnd } })
    ]);

    return success({ total, checkedIn, checkedOut, todays });
  }

  /**
   * Get complaint statistics
   */
  async getComplaintsStats() {
    const [total, pending, resolved, inProgress] = await Promise.all([
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: 'Pending' }),
      Complaint.countDocuments({ status: 'Resolved' }),
      Complaint.countDocuments({ status: 'In Progress' })
    ]);

    return success({ total, pending, resolved, inProgress });
  }
}

export const statsService = new StatsService();
export default statsService;
