/**
 * Hostel Service
 * Contains business logic extracted from hostelController
 * 
 * IMPORTANT: All logic copied exactly from controller
 * Only HTTP-specific code (req, res) removed
 * 
 * @module services/hostel.service
 */

import Hostel from '../../models/Hostel.js';
import Room from '../../models/Room.js';
import Unit from '../../models/Unit.js';
import Complaint from '../../models/Complaint.js';
import RoomAllocation from '../../models/RoomAllocation.js';
import mongoose from 'mongoose';
import StudentProfile from '../../models/StudentProfile.js';

/**
 * Helper function to create units
 * @param {string} hostelId - Hostel ID
 * @param {Array} units - Units data
 * @param {Object} session - Mongoose session
 * @returns {Promise<Object>} Map of unitNumber to unitId
 */
async function createUnits(hostelId, units, session) {
  const createdUnits = {};
  if (Array.isArray(units)) {
    const unitsToInsert = units
      .filter((unitData) => unitData.unitNumber)
      .map((unitData) => {
        const { unitNumber, floor, commonAreaDetails } = unitData;
        return {
          hostelId,
          unitNumber,
          floor: floor || parseInt(unitNumber.charAt(0)) - 1 || 0,
          commonAreaDetails: commonAreaDetails || '',
        };
      });

    if (unitsToInsert.length > 0) {
      const savedUnits = await Unit.insertMany(unitsToInsert, { session });
      savedUnits.forEach((unit) => {
        createdUnits[unit.unitNumber] = unit._id;
      });
    }
  }
  return createdUnits;
}

/**
 * Helper function to create rooms
 * @param {string} hostelId - Hostel ID
 * @param {Array} rooms - Rooms data
 * @param {Object} createdUnits - Map of unitNumber to unitId
 * @param {string} type - Hostel type
 * @param {Object} session - Mongoose session
 */
async function createRooms(hostelId, rooms, createdUnits, type, session) {
  if (Array.isArray(rooms)) {
    for (const roomData of rooms) {
      const { unitNumber, roomNumber, capacity, status } = roomData;
      if (!roomNumber || !capacity) {
        continue;
      }
      const roomFields = {
        hostelId,
        roomNumber,
        capacity,
        status: status || 'Active',
        occupancy: 0,
      };
      if (type === 'unit-based' && unitNumber && createdUnits[unitNumber]) {
        roomFields.unitId = createdUnits[unitNumber];
      }
      const room = new Room(roomFields);
      await room.save({ session });
    }
  }
}

class HostelService {
  /**
   * Add a new hostel
   * @param {Object} hostelData - Hostel data
   * @returns {Promise<{success: boolean, data?: any, message?: string, statusCode?: number}>}
   */
  async addHostel(hostelData) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { name, gender, type, units, rooms } = hostelData;

      if (!name || !gender || !type) {
        return {
          success: false,
          message: 'Missing required hostel information',
          statusCode: 400,
        };
      }

      const newHostel = new Hostel({
        name,
        gender,
        type,
      });

      const savedHostel = await newHostel.save({ session });
      const hostelId = savedHostel._id;

      const createdUnits = {};
      if (type === 'unit-based' && Array.isArray(units)) {
        for (const unitData of units) {
          const { unitNumber, floor, commonAreaDetails } = unitData;

          if (!unitNumber) {
            continue;
          }

          const unit = new Unit({
            hostelId,
            unitNumber,
            floor: floor || 0,
            commonAreaDetails: commonAreaDetails || '',
          });

          const savedUnit = await unit.save({ session });
          createdUnits[unitNumber] = savedUnit._id;
        }
      }

      if (Array.isArray(rooms)) {
        for (const roomData of rooms) {
          const { unitNumber, roomNumber, capacity } = roomData;

          if (!roomNumber || !capacity) {
            continue;
          }

          const roomFields = {
            hostelId,
            roomNumber,
            capacity,
            status: 'Active',
            occupancy: 0,
          };

          if (type === 'unit-based' && unitNumber && createdUnits[unitNumber]) {
            roomFields.unitId = createdUnits[unitNumber];
          }

          const room = new Room(roomFields);
          await room.save({ session });
        }
      }

      await session.commitTransaction();
      session.endSession();

      const totalRooms = Array.isArray(rooms) ? rooms.length : 0;

      return {
        success: true,
        message: 'Hostel added successfully',
        data: {
          id: hostelId,
          name,
          gender,
          type,
          totalUnits: Object.keys(createdUnits).length,
          totalRooms,
        },
        statusCode: 201,
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error.code === 11000) {
        if (error.keyPattern?.name) {
          return {
            success: false,
            message: 'A hostel with this name already exists',
            statusCode: 400,
          };
        }
        if (error.keyPattern?.['hostelId'] && error.keyPattern?.['unitNumber']) {
          return {
            success: false,
            message: 'Duplicate unit number in this hostel',
            statusCode: 400,
          };
        }
        if (error.keyPattern?.['hostelId'] && error.keyPattern?.['unitId'] && error.keyPattern?.['roomNumber']) {
          return {
            success: false,
            message: 'Duplicate room number in this unit/hostel',
            statusCode: 400,
          };
        }
      }

      throw error;
    }
  }

  /**
   * Get all hostels with stats
   * @param {boolean} archive - Whether to get archived hostels
   * @returns {Promise<{success: boolean, data?: any, statusCode?: number}>}
   */
  async getHostels(archive) {
    const hostels = await Hostel.find(
      { isArchived: archive === 'true' ? true : false },
      { _id: 1, name: 1, type: 1, gender: 1, isArchived: 1 }
    );

    const hostelDataPromises = hostels.map(async (hostel) => {
      const [roomStats, maintenanceIssues] = await Promise.all([
        Room.aggregate([
          { $match: { hostelId: hostel._id } },
          {
            $group: {
              _id: null,
              totalRooms: { $sum: 1 },
              totalActiveRooms: {
                $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] },
              },
              occupiedRoomsCount: {
                $sum: { $cond: [{ $gt: ['$occupancy', 0] }, 1, 0] },
              },
              vacantRoomsCount: {
                $sum: { $cond: [{ $and: [{ $eq: ['$occupancy', 0] }, { $eq: ['$status', 'Active'] }] }, 1, 0] },
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

      let stats = {
        totalRooms: 0,
        totalActiveRooms: 0,
        occupiedRooms: 0,
        vacantRooms: 0,
        capacity: 0,
        occupancyRate: 0,
        activeRoomsCapacity: 0,
        activeRoomsOccupancy: 0,
      };

      if (roomStats.length > 0) {
        const { totalRooms, totalActiveRooms, occupiedRoomsCount, vacantRoomsCount, totalCapacity, totalOccupancy, activeRoomsCapacity, activeRoomsOccupancy } = roomStats[0];

        stats = {
          totalRooms,
          totalActiveRooms,
          occupiedRooms: occupiedRoomsCount,
          vacantRooms: vacantRoomsCount,
          capacity: totalCapacity,
          occupancyRate: activeRoomsCapacity > 0 ? Math.round((activeRoomsOccupancy / activeRoomsCapacity) * 100) : 0,
          activeRoomsCapacity,
          activeRoomsOccupancy,
        };
      }

      return {
        id: hostel._id,
        name: hostel.name,
        type: hostel.type,
        gender: hostel.gender,
        totalRooms: stats.totalRooms,
        totalActiveRooms: stats.totalActiveRooms,
        occupiedRooms: stats.occupiedRooms,
        vacantRooms: stats.vacantRooms,
        maintenanceIssues,
        capacity: stats.capacity,
        occupancyRate: stats.occupancyRate,
        activeRoomsCapacity: stats.activeRoomsCapacity,
        activeRoomsOccupancy: stats.activeRoomsOccupancy,
        isArchived: hostel.isArchived,
      };
    });

    const result = await Promise.all(hostelDataPromises);

    return {
      success: true,
      data: result,
      statusCode: 200,
    };
  }

  /**
   * Update hostel
   * @param {string} hostelId - Hostel ID
   * @param {Object} updateData - Update data
   * @returns {Promise<{success: boolean, data?: any, message?: string, statusCode?: number}>}
   */
  async updateHostel(hostelId, updateData) {
    const { name, gender } = updateData;
    const updatedHostel = await Hostel.findByIdAndUpdate(hostelId, { name, gender }, { new: true });
    
    if (!updatedHostel) {
      return {
        success: false,
        message: 'Hostel not found',
        statusCode: 404,
      };
    }
    
    return {
      success: true,
      data: updatedHostel,
      statusCode: 200,
    };
  }

  /**
   * Get hostel list (minimal data)
   * @param {string} archive - Archive filter
   * @returns {Promise<{success: boolean, data?: any, statusCode?: number}>}
   */
  async getHostelList(archive = 'false') {
    const hostels = await Hostel.find(
      { isArchived: archive === 'true' ? true : false },
      { _id: 1, name: 1, type: 1 }
    );
    
    return {
      success: true,
      data: hostels,
      statusCode: 200,
    };
  }

  /**
   * Get units for a hostel
   * @param {string} hostelId - Hostel ID
   * @param {Object} user - Current user
   * @returns {Promise<{success: boolean, data?: any, message?: string, statusCode?: number}>}
   */
  async getUnits(hostelId, user) {
    if (user.hostel && user.hostel._id.toString() !== hostelId) {
      return {
        success: false,
        message: 'You do not have permission to access this hostel',
        statusCode: 403,
      };
    }
    
    const unitsWithRooms = await Unit.find({ hostelId: hostelId })
      .populate('hostelId')
      .populate('rooms');

    const finalResult = unitsWithRooms.map((unit) => ({
      id: unit._id,
      unitNumber: unit.unitNumber,
      hostel: unit.hostelId.name,
      floor: unit.floor,
      commonAreaDetails: unit.commonAreaDetails,
      roomCount: unit.roomCount,
      capacity: unit.capacity,
      occupancy: unit.occupancy,
    }));

    return {
      success: true,
      data: finalResult,
      statusCode: 200,
    };
  }

  /**
   * Get rooms by unit
   * @param {string} unitId - Unit ID
   * @param {Object} user - Current user
   * @returns {Promise<{success: boolean, data?: any, message?: string, meta?: Object, statusCode?: number}>}
   */
  async getRoomsByUnit(unitId, user) {
    const roomsWithStudents = await Room.find({ unitId: unitId })
      .populate({
        path: 'allocations',
        populate: {
          path: 'studentProfileId',
          populate: {
            path: 'userId',
            select: 'name email profileImage',
          },
        },
      })
      .populate('hostelId', 'name type')
      .populate('unitId', 'unitNumber floor');

    if (roomsWithStudents.length && user.hostel && user.hostel._id.toString() !== roomsWithStudents[0].hostelId._id.toString()) {
      return {
        success: false,
        message: "You do not have permission to access this unit's rooms",
        statusCode: 403,
      };
    }

    const finalResults = roomsWithStudents.map((room) => ({
      id: room._id,
      unit: room.unitId,
      hostel: room.hostelId,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      currentOccupancy: room.occupancy,
      status: room.status,
      students:
        room.allocations.map((allocation) => ({
          id: allocation.studentProfileId._id,
          userId: allocation.studentProfileId.userId._id,
          name: allocation.studentProfileId.userId.name,
          email: allocation.studentProfileId.userId.email,
          profileImage: allocation.studentProfileId.userId.profileImage,
          rollNumber: allocation.studentProfileId.rollNumber,
          department: allocation.studentProfileId.department,
          bedNumber: allocation.bedNumber,
          allocationId: allocation._id,
        })) || [],
    }));

    return {
      success: true,
      data: finalResults,
      message: 'Rooms fetched successfully',
      meta: {
        total: roomsWithStudents.length,
      },
      statusCode: 200,
    };
  }

  /**
   * Get rooms for a hostel
   * @param {string} hostelId - Hostel ID
   * @param {Object} user - Current user
   * @returns {Promise<{success: boolean, data?: any, message?: string, meta?: Object, statusCode?: number}>}
   */
  async getRooms(hostelId, user) {
    if (user.hostel && user.hostel._id.toString() !== hostelId) {
      return {
        success: false,
        message: "You do not have permission to access this hostel's rooms",
        statusCode: 403,
      };
    }

    const roomsWithStudents = await Room.find({ hostelId: hostelId }).populate({
      path: 'allocations',
      populate: {
        path: 'studentProfileId',
        populate: {
          path: 'userId',
          select: 'name email profileImage',
        },
      },
    });

    const finalResult = roomsWithStudents.map((room) => ({
      id: room._id,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      currentOccupancy: room.occupancy,
      status: room.status,
      hostel: room.hostelId,
      students:
        room.allocations.map((allocation) => ({
          id: allocation.studentProfileId._id,
          name: allocation.studentProfileId.userId.name,
          email: allocation.studentProfileId.userId.email,
          profileImage: allocation.studentProfileId.userId.profileImage,
          rollNumber: allocation.studentProfileId.rollNumber,
          department: allocation.studentProfileId.department,
          bedNumber: allocation.bedNumber,
          allocationId: allocation._id,
        })) || [],
    }));

    return {
      success: true,
      data: finalResult,
      message: 'Rooms fetched successfully',
      meta: {
        total: roomsWithStudents.length,
      },
      statusCode: 200,
    };
  }

  /**
   * Update room status
   * @param {string} roomId - Room ID
   * @param {string} status - New status
   * @returns {Promise<{success: boolean, data?: any, message?: string, statusCode?: number}>}
   */
  async updateRoomStatus(roomId, status) {
    let updatedRoom = null;

    if (status === 'Inactive') {
      updatedRoom = await Room.deactivateRoom(roomId);
    } else if (status === 'Active') {
      updatedRoom = await Room.activateRoom(roomId);
    } else {
      return {
        success: false,
        message: 'Invalid status value',
        statusCode: 400,
      };
    }

    if (!updatedRoom) {
      return {
        success: false,
        message: 'Room not found',
        statusCode: 404,
      };
    }

    if (status === 'Inactive') {
      await RoomAllocation.deleteMany({ roomId });
    }
    
    return {
      success: true,
      message: 'Room status updated successfully',
      data: updatedRoom,
      statusCode: 200,
    };
  }

  /**
   * Allocate room to student
   * @param {Object} allocationData - Allocation data
   * @returns {Promise<{success: boolean, data?: any, message?: string, statusCode?: number}>}
   */
  async allocateRoom(allocationData) {
    const { roomId, hostelId, unitId, studentId, bedNumber, userId } = allocationData;
    
    if (!roomId || !hostelId || !studentId || !bedNumber || !userId) {
      return {
        success: false,
        message: 'Missing required fields',
        statusCode: 400,
      };
    }

    const hostel = await Hostel.findById(hostelId);
    if (!hostel) {
      return {
        success: false,
        message: 'Hostel not found',
        statusCode: 404,
      };
    }

    if (hostel.type === 'unit-based' && !unitId) {
      return {
        success: false,
        message: 'Unit ID is required for unit-based hostels',
        statusCode: 400,
      };
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return {
        success: false,
        message: 'Room not found',
        statusCode: 404,
      };
    }

    if (room.status !== 'Active') {
      return {
        success: false,
        message: 'Cannot allocate an inactive room',
        statusCode: 400,
      };
    }

    if (room.occupancy >= room.capacity) {
      return {
        success: false,
        message: 'Room is already at full capacity',
        statusCode: 400,
      };
    }

    if (bedNumber <= 0 || bedNumber > room.capacity) {
      return {
        success: false,
        message: `Invalid bed number. Must be between 1 and ${room.capacity}`,
        statusCode: 400,
      };
    }

    const existingBedAllocation = await RoomAllocation.findOne({
      roomId,
      bedNumber,
    });

    if (existingBedAllocation) {
      return {
        success: false,
        message: 'The selected bed is already occupied',
        statusCode: 400,
      };
    }

    const existingAllocation = await RoomAllocation.findOne({
      studentProfileId: studentId,
    });

    if (existingAllocation) {
      return {
        success: false,
        message: 'Student already has a room allocation. Please deallocate first.',
        statusCode: 400,
      };
    }

    const newAllocationData = {
      userId,
      roomId,
      hostelId,
      studentProfileId: studentId,
      bedNumber,
    };

    if (hostel.type === 'unit-based') {
      newAllocationData.unitId = unitId;
    }

    const newAllocation = new RoomAllocation(newAllocationData);
    await newAllocation.save();

    return {
      success: true,
      message: 'Room allocated successfully',
      data: newAllocation,
      statusCode: 200,
    };
  }

  /**
   * Delete room allocation
   * @param {string} allocationId - Allocation ID
   * @returns {Promise<{success: boolean, message?: string, statusCode?: number}>}
   */
  async deleteAllocation(allocationId) {
    const allocation = await RoomAllocation.findByIdAndDelete(allocationId);
    
    if (!allocation) {
      return {
        success: false,
        message: 'Allocation not found',
        statusCode: 404,
      };
    }
    
    return {
      success: true,
      message: 'Room allocation deleted successfully',
      statusCode: 200,
    };
  }

  /**
   * Get rooms for edit
   * @param {string} hostelId - Hostel ID
   * @returns {Promise<{success: boolean, data?: any, message?: string, meta?: Object, statusCode?: number}>}
   */
  async getRoomsForEdit(hostelId) {
    const rooms = await Room.find({ hostelId: hostelId }).populate('unitId');

    const finalResult = rooms.map((room) => ({
      id: room._id,
      unitNumber: room.unitId ? room.unitId.unitNumber : null,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      status: room.status,
    }));
    
    return {
      success: true,
      message: 'Rooms fetched successfully',
      meta: {
        total: rooms.length,
      },
      data: finalResult,
      statusCode: 200,
    };
  }

  /**
   * Update room
   * @param {string} roomId - Room ID
   * @param {Object} updateData - Update data
   * @returns {Promise<{success: boolean, message?: string, statusCode?: number}>}
   */
  async updateRoom(roomId, updateData) {
    const { capacity, status } = updateData;

    if (status === 'Inactive') {
      await Room.deactivateRoom(roomId);
    } else if (status === 'Active') {
      await Room.activateRoom(roomId);
      await Room.findByIdAndUpdate(roomId, { capacity }, { new: true });
    } else {
      return {
        success: false,
        message: 'Invalid status value',
        statusCode: 400,
      };
    }

    if (status === 'Inactive') {
      await RoomAllocation.deleteMany({ roomId });
    }

    return {
      success: true,
      message: 'Room updated successfully',
      statusCode: 200,
    };
  }

  /**
   * Add rooms to hostel
   * @param {string} hostelId - Hostel ID
   * @param {Object} roomsData - Rooms data
   * @returns {Promise<{success: boolean, message?: string, statusCode?: number}>}
   */
  async addRooms(hostelId, roomsData) {
    const { rooms, units } = roomsData;

    const hostel = await Hostel.findById(hostelId);
    if (!hostel) {
      return {
        success: false,
        message: 'Hostel not found',
        statusCode: 404,
      };
    }

    const uniqueUnits = [...new Set(units)];
    const createdUnits = await createUnits(hostelId, uniqueUnits);

    console.log('Created Units:', createdUnits);

    await createRooms(hostelId, rooms, createdUnits, hostel.type);

    console.log('Rooms added successfully for hostel:', hostelId);

    return {
      success: true,
      message: 'Rooms added successfully',
      statusCode: 200,
    };
  }

  /**
   * Bulk update rooms
   * @param {string} hostelId - Hostel ID
   * @param {Array} rooms - Rooms data
   * @returns {Promise<{success: boolean, data?: any, message?: string, statusCode?: number}>}
   */
  async bulkUpdateRooms(hostelId, rooms) {
    const hostel = await Hostel.findById(hostelId);
    if (!hostel) {
      return {
        success: false,
        message: 'Hostel not found',
        statusCode: 404,
      };
    }

    // Prepare buckets
    const roomsToActivate = [];
    const roomsToDeactivate = [];
    const roomsToUpdateCapacity = [];

    if (hostel.type === 'unit-based') {
      // Unit-based: match by unitNumber + roomNumber
      const uniqueUnits = [...new Set(rooms.map((room) => room.unitNumber))];
      const units = await Unit.find({ hostelId, unitNumber: { $in: uniqueUnits } });

      const unitMap = {};
      units.forEach((unit) => {
        unitMap[unit.unitNumber] = unit._id;
      });

      const roomsToUpdate = rooms.map((room) => room.roomNumber);
      const existingRooms = await Room.find({
        hostelId,
        roomNumber: { $in: roomsToUpdate },
        unitId: { $in: Object.values(unitMap) },
      }).populate('unitId', 'unitNumber');

      const filteredExistingRooms = existingRooms.filter((room) => 
        rooms.some((r) => r.roomNumber === room.roomNumber && r.unitNumber === room.unitId.unitNumber)
      );

      uniqueUnits.forEach((unitNumber) => {
        const roomsInUnit = filteredExistingRooms.filter((room) => room.unitId.unitNumber === unitNumber);
        roomsInUnit.forEach((room) => {
          const roomData = rooms.find((r) => r.roomNumber === room.roomNumber && r.unitNumber === room.unitId.unitNumber);
          if (roomData) {
            if (roomData.status && room.status !== roomData.status) {
              if (roomData.status === 'Active') {
                roomsToActivate.push(room._id);
              } else if (roomData.status === 'Inactive') {
                roomsToDeactivate.push(room._id);
              }
            } else if (room.status === 'Active' && roomData.capacity && room.capacity !== roomData.capacity) {
              roomsToUpdateCapacity.push({ roomId: room._id, capacity: roomData.capacity });
            }
          }
        });
      });
    } else if (hostel.type === 'room-only') {
      // Room-only: match by roomNumber only
      const roomsToUpdate = rooms.map((room) => room.roomNumber);
      const existingRooms = await Room.find({ hostelId, roomNumber: { $in: roomsToUpdate } });

      existingRooms.forEach((room) => {
        const roomData = rooms.find((r) => r.roomNumber === room.roomNumber);
        if (roomData) {
          if (roomData.status && room.status !== roomData.status) {
            if (roomData.status === 'Active') {
              roomsToActivate.push(room._id);
            } else if (roomData.status === 'Inactive') {
              roomsToDeactivate.push(room._id);
            }
          } else if (room.status === 'Active' && roomData.capacity && room.capacity !== roomData.capacity) {
            roomsToUpdateCapacity.push({ roomId: room._id, capacity: roomData.capacity });
          }
        }
      });
    } else {
      return {
        success: false,
        message: 'Unsupported hostel type',
        statusCode: 400,
      };
    }

    // No rooms to update
    if (roomsToActivate.length === 0 && roomsToDeactivate.length === 0 && roomsToUpdateCapacity.length === 0) {
      return {
        success: true,
        message: 'No rooms to update',
        statusCode: 200,
      };
    }

    const updatedRoomIds = [];

    if (roomsToActivate.length > 0) {
      const activatedRooms = await Room.activateRooms(roomsToActivate);
      updatedRoomIds.push(...activatedRooms.map((room) => room._id));
    }

    if (roomsToDeactivate.length > 0) {
      const deactivatedRooms = await Room.deactivateRooms(roomsToDeactivate);
      updatedRoomIds.push(...deactivatedRooms.map((room) => room._id));
    }

    if (roomsToUpdateCapacity.length > 0) {
      const bulkOps = roomsToUpdateCapacity.map((room) => ({
        updateOne: { filter: { _id: room.roomId }, update: { capacity: room.capacity } },
      }));
      await Room.bulkWrite(bulkOps);
      updatedRoomIds.push(...roomsToUpdateCapacity.map((room) => room.roomId));
    }

    if (roomsToDeactivate.length > 0) {
      await RoomAllocation.deleteMany({ roomId: { $in: roomsToDeactivate } });
    }

    return {
      success: true,
      message: 'Rooms updated successfully',
      data: { updatedRoomIds },
      statusCode: 200,
    };
  }

  /**
   * Change hostel archive status
   * @param {string} hostelId - Hostel ID
   * @param {boolean} status - Archive status
   * @returns {Promise<{success: boolean, message?: string, statusCode?: number}>}
   */
  async changeArchiveStatus(hostelId, status) {
    const hostel = await Hostel.findById(hostelId);
    if (!hostel) {
      return {
        success: false,
        message: 'Hostel not found',
        statusCode: 404,
      };
    }

    hostel.isArchived = status;
    await hostel.save();

    return {
      success: true,
      message: 'Hostel archive status updated successfully',
      statusCode: 200,
    };
  }

  /**
   * Delete all allocations for a hostel
   * @param {string} hostelId - Hostel ID
   * @returns {Promise<{success: boolean, message?: string, statusCode?: number}>}
   */
  async deleteAllAllocations(hostelId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const allocations = await RoomAllocation.find({ hostelId }).session(session);
      await StudentProfile.updateMany(
        { currentRoomAllocation: { $in: allocations.map((a) => a._id) } },
        { $unset: { currentRoomAllocation: undefined } }
      );
      await RoomAllocation.deleteMany({ hostelId }).session(session);
      await Room.updateMany({ hostelId }, { occupancy: 0 });
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    
    return {
      success: true,
      message: 'All allocations deleted',
      statusCode: 200,
    };
  }
}

export const hostelService = new HostelService();
