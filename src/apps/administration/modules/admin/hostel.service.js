/**
 * Hostel Service
 * Handles hostel master-data operations for admin routes.
 * @module services/hostel.service
 */

import {
  BaseService,
  success,
  notFound,
  badRequest,
  withTransaction,
} from '../../../../services/base/index.js';
import {
  Hostel,
  Room,
  Unit,
  Complaint,
} from '../../../../models/index.js';

class HostelService extends BaseService {
  constructor() {
    super(Hostel, 'Hostel');
  }

  /**
   * Add a new hostel
   */
  async addHostel(hostelData) {
    return withTransaction(async (session) => {
      const { name, gender, type, units, rooms } = hostelData;

      if (!name || !gender || !type) {
        return badRequest('Missing required hostel information');
      }

      const savedHostel = await new Hostel({ name, gender, type }).save({ session });
      const hostelId = savedHostel._id;

      const createdUnits = {};
      if (type === 'unit-based' && Array.isArray(units)) {
        for (const unitData of units) {
          if (!unitData.unitNumber) continue;
          const unit = await new Unit({
            hostelId,
            unitNumber: unitData.unitNumber,
            floor: unitData.floor || 0,
            commonAreaDetails: unitData.commonAreaDetails || '',
          }).save({ session });
          createdUnits[unitData.unitNumber] = unit._id;
        }
      }

      if (Array.isArray(rooms)) {
        for (const roomData of rooms) {
          if (!roomData.roomNumber || !roomData.capacity) continue;
          const roomFields = {
            hostelId,
            roomNumber: roomData.roomNumber,
            capacity: roomData.capacity,
            status: 'Active',
            occupancy: 0,
          };
          if (type === 'unit-based' && roomData.unitNumber && createdUnits[roomData.unitNumber]) {
            roomFields.unitId = createdUnits[roomData.unitNumber];
          }
          await new Room(roomFields).save({ session });
        }
      }

      return success(
        {
          id: hostelId,
          name,
          gender,
          type,
          totalUnits: Object.keys(createdUnits).length,
          totalRooms: Array.isArray(rooms) ? rooms.length : 0,
        },
        201,
        'Hostel added successfully',
      );
    });
  }

  /**
   * Get all hostels with stats
   */
  async getHostels(archive) {
    const hostels = await this.model.find(
      { isArchived: archive === 'true' },
      { _id: 1, name: 1, type: 1, gender: 1, isArchived: 1 },
    );

    const result = await Promise.all(
      hostels.map(async (hostel) => {
        const [roomStats, maintenanceIssues] = await Promise.all([
          Room.aggregate([
            { $match: { hostelId: hostel._id } },
            {
              $group: {
                _id: null,
                totalRooms: { $sum: 1 },
                totalActiveRooms: { $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] } },
                occupiedRoomsCount: { $sum: { $cond: [{ $gt: ['$occupancy', 0] }, 1, 0] } },
                vacantRoomsCount: {
                  $sum: {
                    $cond: [
                      { $and: [{ $eq: ['$occupancy', 0] }, { $eq: ['$status', 'Active'] }] },
                      1,
                      0,
                    ],
                  },
                },
                totalCapacity: { $sum: '$capacity' },
                totalOccupancy: { $sum: '$occupancy' },
                activeRoomsCapacity: {
                  $sum: { $cond: [{ $eq: ['$status', 'Active'] }, '$capacity', 0] },
                },
                activeRoomsOccupancy: {
                  $sum: { $cond: [{ $eq: ['$status', 'Active'] }, '$occupancy', 0] },
                },
              },
            },
          ]),
          Complaint.countDocuments({
            hostelId: hostel._id,
            status: { $in: ['Pending', 'In Progress'] },
          }),
        ]);

        const stats = roomStats.length > 0
          ? roomStats[0]
          : {
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
    const { name, gender } = updateData;
    const updatedHostel = await this.model.findByIdAndUpdate(hostelId, { name, gender }, { new: true });

    if (!updatedHostel) {
      return notFound('Hostel not found');
    }

    return success(updatedHostel);
  }

  /**
   * Get hostel list (minimal data)
   */
  async getHostelList(archive = 'false') {
    const hostels = await this.model.find(
      { isArchived: archive === 'true' },
      { _id: 1, name: 1, type: 1 },
    );
    return success(hostels);
  }
}

export const hostelService = new HostelService();
export default hostelService;
