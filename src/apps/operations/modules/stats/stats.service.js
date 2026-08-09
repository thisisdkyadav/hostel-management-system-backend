/**
 * Stats Service
 * Contains all business logic for statistics operations.
 * 
 * @module services/stats
 */

import { complaintQueries } from '../../../../services/complaint/complaintQueries.service.js';
import { eventQueries } from '../../../../services/event/eventQueries.service.js';
import { lostAndFoundQueries } from '../../../../services/lost-found/lostAndFoundQueries.service.js';
import { staffRolesQueries } from '../../../../services/user/staffRolesQueries.service.js';
import { success } from '../../../../services/base/index.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';
import { visitorQueries } from '../../../../services/visitor/visitorQueries.service.js';

class StatsService {
  /**
   * Get hostel statistics
   */
  async getHostelStats() {
    const [totalHostels, roomStats] = await Promise.all([
      hostelQueries.countHostels(),
      hostelQueries.getGlobalActiveRoomStats()
    ]);

    let stats = { totalRooms: 0, occupiedRooms: 0, availableRooms: 0, occupancyRate: 0 };

    if (roomStats) {
      const { totalRooms, occupiedRooms, availableRooms } = roomStats;
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
      staffRolesQueries.countByRole('Warden'),
      staffRolesQueries.countByRole('Warden', { status: 'assigned' }),
      staffRolesQueries.countByRole('Warden', { status: 'unassigned' })
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
      eventQueries.countEvents({ hostelId }),
      eventQueries.countEvents({ dateAndTime: { $gt: currentDate }, hostelId }),
      eventQueries.countEvents({ dateAndTime: { $lte: currentDate }, hostelId })
    ]);

    return success({ total, upcoming, past });
  }

  /**
   * Get lost and found statistics
   */
  async getLostAndFoundStats() {
    const [total, active, claimed] = await Promise.all([
      lostAndFoundQueries.countItems(),
      lostAndFoundQueries.countItems({ status: 'Active' }),
      lostAndFoundQueries.countItems({ status: 'Claimed' })
    ]);

    return success({ total, active, claimed });
  }

  /**
   * Get security staff statistics
   */
  async getSecurityStaffStats() {
    const [total, assigned, unassigned] = await Promise.all([
      staffRolesQueries.countByRole('Security'),
      staffRolesQueries.countByRole('Security', { hostelId: { $ne: null } }),
      staffRolesQueries.countByRole('Security', { hostelId: null })
    ]);

    return success({ total, assigned, unassigned });
  }

  /**
   * Get maintenance staff statistics
   */
  async getMaintenanceStaffStats() {
    const [total, plumbing, electrical, cleanliness, internet, civil] = await Promise.all([
      staffRolesQueries.countByRole('MaintenanceStaff'),
      staffRolesQueries.countByRole('MaintenanceStaff', { category: 'Plumbing' }),
      staffRolesQueries.countByRole('MaintenanceStaff', { category: 'Electrical' }),
      staffRolesQueries.countByRole('MaintenanceStaff', { category: 'Cleanliness' }),
      staffRolesQueries.countByRole('MaintenanceStaff', { category: 'Internet' }),
      staffRolesQueries.countByRole('MaintenanceStaff', { category: 'Civil' })
    ]);

    return success({ total, plumbing, electrical, cleanliness, internet, civil });
  }

  /**
   * Get room statistics for a hostel
   * @param {string} hostelId - Hostel ID
   */
  async getRoomStats(hostelId) {
    const { totalRooms, availableRooms, occupiedRooms } = await hostelQueries.countRoomsByHostel(hostelId);

    return success({ totalRooms, availableRooms, occupiedRooms });
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
      visitorQueries.countVisitors({ hostelId }),
      visitorQueries.countVisitors({ status: 'Checked In', hostelId }),
      visitorQueries.countVisitors({ status: 'Checked Out', hostelId }),
      visitorQueries.countVisitors({ hostelId, checkIn: { $gte: todayStart, $lt: todayEnd } })
    ]);

    return success({ total, checkedIn, checkedOut, todays });
  }

  /**
   * Get complaint statistics
   */
  async getComplaintsStats() {
    const [total, pending, resolved, inProgress] = await Promise.all([
      complaintQueries.countComplaints(),
      complaintQueries.countComplaints({ status: 'Pending' }),
      complaintQueries.countComplaints({ status: 'Resolved' }),
      complaintQueries.countComplaints({ status: 'In Progress' })
    ]);

    return success({ total, pending, resolved, inProgress });
  }
}

export const statsService = new StatsService();
export default statsService;
