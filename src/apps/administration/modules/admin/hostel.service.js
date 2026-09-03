/**
 * Hostel Service
 * Thin delegator for the admin hostel routes. All Hostel/Room/Unit access goes
 * through the hostel domain services: writes via roomOwner, reads via
 * hostelQueries. Kept as the module the admin controller imports so the route
 * contracts are unchanged.
 * @module services/hostel.service
 */

import { success } from '../../../../services/base/index.js';
import { complaintQueries } from '../../../../services/complaint/complaintQueries.service.js';
import { roomOwner } from '../../../../services/hostel/roomOwner.service.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';

class HostelService {
  /**
   * Add a new hostel
   */
  async addHostel(hostelData) {
    return roomOwner.createHostel(hostelData);
  }

  /**
   * Get all hostels with stats
   */
  async getHostels(archive) {
    const hostels = await hostelQueries.findHostelsForStats(archive);

    const result = await Promise.all(
      hostels.map(async (hostel) => {
        const [roomStats, maintenanceIssues] = await Promise.all([
          hostelQueries.getRoomStatsForHostel(hostel._id),
          complaintQueries.countComplaints({
            hostelId: hostel._id,
            status: { $in: ['Pending', 'In Progress'] },
          }),
        ]);

        const stats = roomStats || {
          totalRooms: 0,
          totalActiveRooms: 0,
          occupiedRoomsCount: 0,
          vacantRoomsCount: 0,
          totalCapacity: 0,
          totalOccupancy: 0,
          activeRoomsCapacity: 0,
          activeRoomsOccupancy: 0,
        };

        return {
          id: hostel._id,
          name: hostel.name,
          type: hostel.type,
          gender: hostel.gender,
          email: hostel.email || "",
          phone: hostel.phone || "",
          extensionNumber: hostel.extensionNumber || "",
          totalRooms: stats.totalRooms,
          totalActiveRooms: stats.totalActiveRooms,
          occupiedRooms: stats.occupiedRoomsCount,
          vacantRooms: stats.vacantRoomsCount,
          maintenanceIssues,
          capacity: stats.totalCapacity,
          occupancyRate:
            stats.activeRoomsCapacity > 0
              ? Math.round((stats.activeRoomsOccupancy / stats.activeRoomsCapacity) * 100)
              : 0,
          activeRoomsCapacity: stats.activeRoomsCapacity,
          activeRoomsOccupancy: stats.activeRoomsOccupancy,
          isArchived: hostel.isArchived,
        };
      }),
    );

    return success(result);
  }

  /**
   * Update hostel
   */
  async updateHostel(hostelId, updateData) {
    return roomOwner.updateHostel(hostelId, updateData);
  }

  /**
   * Get hostel list (minimal data)
   */
  async getHostelList(archive = 'false') {
    const hostels = await hostelQueries.findHostelListMinimal(archive);
    return success(hostels);
  }
}

export const hostelService = new HostelService();
export default hostelService;
