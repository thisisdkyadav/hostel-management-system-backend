/**
 * Hostel Service
 * Handles hostel operations with BaseService pattern
 * @module services/hostel.service
 */

import { BaseService, success, notFound, badRequest, forbidden, withTransaction } from '../../../services/base/index.js';
import { Hostel } from '../../../models/index.js';
import { Room } from '../../../models/index.js';
import { Unit } from '../../../models/index.js';
import { Complaint } from '../../../models/index.js';
import { RoomAllocation } from '../../../models/index.js';
import mongoose from 'mongoose';
import { StudentProfile } from '../../../models/index.js';

/**
 * Helper function to create units
 */
async function createUnits(hostelId, units, session) {
  const createdUnits = {};
  if (!Array.isArray(units)) return createdUnits;

  const unitsToInsert = units
    .filter((unitData) => unitData.unitNumber)
    .map((unitData) => ({
      hostelId,
      unitNumber: unitData.unitNumber,
      floor: unitData.floor || parseInt(unitData.unitNumber.charAt(0)) - 1 || 0,
      commonAreaDetails: unitData.commonAreaDetails || ''
    }));

  if (unitsToInsert.length > 0) {
    const savedUnits = await Unit.insertMany(unitsToInsert, { session });
    savedUnits.forEach((unit) => { createdUnits[unit.unitNumber] = unit._id; });
  }
  return createdUnits;
}

/**
 * Helper function to create rooms
 */
async function createRooms(hostelId, rooms, createdUnits, type, session) {
  if (!Array.isArray(rooms)) return;

  for (const roomData of rooms) {
    const { unitNumber, roomNumber, capacity, status } = roomData;
    if (!roomNumber || !capacity) continue;

    const roomFields = {
      hostelId,
      roomNumber,
      capacity,
      status: status || 'Active',
      occupancy: 0
    };

    if (type === 'unit-based' && unitNumber && createdUnits[unitNumber]) {
      roomFields.unitId = createdUnits[unitNumber];
    }

    await new Room(roomFields).save({ session });
  }
}

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
            commonAreaDetails: unitData.commonAreaDetails || ''
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
            occupancy: 0
          };
          if (type === 'unit-based' && roomData.unitNumber && createdUnits[roomData.unitNumber]) {
            roomFields.unitId = createdUnits[roomData.unitNumber];
          }
          await new Room(roomFields).save({ session });
        }
      }

      return success({
        id: hostelId,
        name,
        gender,
        type,
        totalUnits: Object.keys(createdUnits).length,
        totalRooms: Array.isArray(rooms) ? rooms.length : 0
      }, 201, 'Hostel added successfully');
    });
  }

  /**
   * Get all hostels with stats
   */
  async getHostels(archive) {
    const hostels = await this.model.find(
      { isArchived: archive === 'true' },
      { _id: 1, name: 1, type: 1, gender: 1, isArchived: 1 }
    );

    const result = await Promise.all(hostels.map(async (hostel) => {
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
        occupancyRate: stats.activeRoomsCapacity > 0 ? Math.round((stats.activeRoomsOccupancy / stats.activeRoomsCapacity) * 100) : 0,
        activeRoomsCapacity: stats.activeRoomsCapacity,
        activeRoomsOccupancy: stats.activeRoomsOccupancy,
        isArchived: hostel.isArchived
      };
    }));

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
      { _id: 1, name: 1, type: 1 }
    );
    return success(hostels);
  }

  /**
   * Get units for a hostel
   */
  async getUnits(hostelId, user) {
    if (user.hostel && user.hostel._id.toString() !== hostelId) {
      return forbidden('You do not have permission to access this hostel');
    }
    
    const unitsWithRooms = await Unit.find({ hostelId })
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
      occupancy: unit.occupancy
    }));

    return success(finalResult);
  }

  /**
   * Get rooms by unit
   */
  async getRoomsByUnit(unitId, user) {
    const roomsWithStudents = await Room.find({ unitId })
      .populate({
        path: 'allocations',
        populate: { path: 'studentProfileId', populate: { path: 'userId', select: 'name email profileImage' } }
      })
      .populate('hostelId', 'name type')
      .populate('unitId', 'unitNumber floor');

    if (roomsWithStudents.length && user.hostel && 
        user.hostel._id.toString() !== roomsWithStudents[0].hostelId._id.toString()) {
      return forbidden("You do not have permission to access this unit's rooms");
    }

    const finalResults = roomsWithStudents.map((room) => ({
      id: room._id,
      unit: room.unitId,
      hostel: room.hostelId,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      currentOccupancy: room.occupancy,
      status: room.status,
      students: room.allocations.map((allocation) => ({
        id: allocation.studentProfileId._id,
        userId: allocation.studentProfileId.userId._id,
        name: allocation.studentProfileId.userId.name,
        email: allocation.studentProfileId.userId.email,
        profileImage: allocation.studentProfileId.userId.profileImage,
        rollNumber: allocation.studentProfileId.rollNumber,
        department: allocation.studentProfileId.department,
        bedNumber: allocation.bedNumber,
        allocationId: allocation._id
      })) || []
    }));

    return success(finalResults, 200, 'Rooms fetched successfully');
  }

  /**
   * Get rooms for a hostel
   */
  async getRooms(hostelId, user) {
    if (user.hostel && user.hostel._id.toString() !== hostelId) {
      return forbidden("You do not have permission to access this hostel's rooms");
    }

    const roomsWithStudents = await Room.find({ hostelId }).populate({
      path: 'allocations',
      populate: { path: 'studentProfileId', populate: { path: 'userId', select: 'name email profileImage' } }
    });

    const finalResult = roomsWithStudents.map((room) => ({
      id: room._id,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      currentOccupancy: room.occupancy,
      status: room.status,
      hostel: room.hostelId,
      students: room.allocations.map((allocation) => ({
        id: allocation.studentProfileId._id,
        name: allocation.studentProfileId.userId.name,
        email: allocation.studentProfileId.userId.email,
        profileImage: allocation.studentProfileId.userId.profileImage,
        rollNumber: allocation.studentProfileId.rollNumber,
        department: allocation.studentProfileId.department,
        bedNumber: allocation.bedNumber,
        allocationId: allocation._id
      })) || []
    }));

    return success(finalResult, 200, 'Rooms fetched successfully');
  }

  /**
   * Update room status
   */
  async updateRoomStatus(roomId, status) {
    let updatedRoom;

    if (status === 'Inactive') {
      updatedRoom = await Room.deactivateRoom(roomId);
    } else if (status === 'Active') {
      updatedRoom = await Room.activateRoom(roomId);
    } else {
      return badRequest('Invalid status value');
    }

    if (!updatedRoom) {
      return notFound('Room not found');
    }

    if (status === 'Inactive') {
      await RoomAllocation.deleteMany({ roomId });
    }
    
    return success(updatedRoom, 200, 'Room status updated successfully');
  }

  /**
   * Allocate room to student
   */
  async allocateRoom(allocationData) {
    const { roomId, hostelId, unitId, studentId, bedNumber, userId } = allocationData;
    
    if (!roomId || !hostelId || !studentId || !bedNumber || !userId) {
      return badRequest('Missing required fields');
    }

    const hostel = await this.model.findById(hostelId);
    if (!hostel) {
      return notFound('Hostel not found');
    }

    if (hostel.type === 'unit-based' && !unitId) {
      return badRequest('Unit ID is required for unit-based hostels');
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return notFound('Room not found');
    }

    if (room.status !== 'Active') {
      return badRequest('Cannot allocate an inactive room');
    }

    if (room.occupancy >= room.capacity) {
      return badRequest('Room is already at full capacity');
    }

    if (bedNumber <= 0 || bedNumber > room.capacity) {
      return badRequest(`Invalid bed number. Must be between 1 and ${room.capacity}`);
    }

    const existingBedAllocation = await RoomAllocation.findOne({ roomId, bedNumber });
    if (existingBedAllocation) {
      return badRequest('The selected bed is already occupied');
    }

    const existingAllocation = await RoomAllocation.findOne({ studentProfileId: studentId });
    if (existingAllocation) {
      return badRequest('Student already has a room allocation. Please deallocate first.');
    }

    const newAllocationData = { userId, roomId, hostelId, studentProfileId: studentId, bedNumber };
    if (hostel.type === 'unit-based') {
      newAllocationData.unitId = unitId;
    }

    const newAllocation = new RoomAllocation(newAllocationData);
    await newAllocation.save();

    return success(newAllocation, 200, 'Room allocated successfully');
  }

  /**
   * Delete room allocation
   */
  async deleteAllocation(allocationId) {
    const allocation = await RoomAllocation.findByIdAndDelete(allocationId);
    
    if (!allocation) {
      return notFound('Allocation not found');
    }
    
    return success(null, 200, 'Room allocation deleted successfully');
  }

  /**
   * Get rooms for edit
   */
  async getRoomsForEdit(hostelId) {
    const rooms = await Room.find({ hostelId }).populate('unitId');

    const finalResult = rooms.map((room) => ({
      id: room._id,
      unitNumber: room.unitId ? room.unitId.unitNumber : null,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      status: room.status
    }));
    
    return success(finalResult, 200, 'Rooms fetched successfully');
  }

  /**
   * Update room
   */
  async updateRoom(roomId, updateData) {
    const { capacity, status } = updateData;

    if (status === 'Inactive') {
      await Room.deactivateRoom(roomId);
    } else if (status === 'Active') {
      await Room.activateRoom(roomId);
      await Room.findByIdAndUpdate(roomId, { capacity }, { new: true });
    } else {
      return badRequest('Invalid status value');
    }

    if (status === 'Inactive') {
      await RoomAllocation.deleteMany({ roomId });
    }

    return success(null, 200, 'Room updated successfully');
  }

  /**
   * Add rooms to hostel
   */
  async addRooms(hostelId, roomsData) {
    const { rooms, units } = roomsData;

    const hostel = await this.model.findById(hostelId);
    if (!hostel) {
      return notFound('Hostel not found');
    }

    const uniqueUnits = [...new Set(units)];
    const createdUnits = await createUnits(hostelId, uniqueUnits);
    await createRooms(hostelId, rooms, createdUnits, hostel.type);

    return success(null, 200, 'Rooms added successfully');
  }

  /**
   * Bulk update rooms
   */
  async bulkUpdateRooms(hostelId, rooms) {
    const hostel = await this.model.findById(hostelId);
    if (!hostel) {
      return notFound('Hostel not found');
    }

    const roomsToActivate = [];
    const roomsToDeactivate = [];
    const roomsToUpdateCapacity = [];

    if (hostel.type === 'unit-based') {
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
        unitId: { $in: Object.values(unitMap) }
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
      return badRequest('Unsupported hostel type');
    }

    if (roomsToActivate.length === 0 && roomsToDeactivate.length === 0 && roomsToUpdateCapacity.length === 0) {
      return success(null, 200, 'No rooms to update');
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
        updateOne: { filter: { _id: room.roomId }, update: { capacity: room.capacity } }
      }));
      await Room.bulkWrite(bulkOps);
      updatedRoomIds.push(...roomsToUpdateCapacity.map((room) => room.roomId));
    }

    if (roomsToDeactivate.length > 0) {
      await RoomAllocation.deleteMany({ roomId: { $in: roomsToDeactivate } });
    }

    return success({ updatedRoomIds }, 200, 'Rooms updated successfully');
  }

  /**
   * Change hostel archive status
   */
  async changeArchiveStatus(hostelId, status) {
    const hostel = await this.model.findById(hostelId);
    if (!hostel) {
      return notFound('Hostel not found');
    }

    hostel.isArchived = status;
    await hostel.save();

    return success(null, 200, 'Hostel archive status updated successfully');
  }

  /**
   * Delete all allocations for a hostel
   */
  async deleteAllAllocations(hostelId) {
    return withTransaction(async (session) => {
      const allocations = await RoomAllocation.find({ hostelId }).session(session);
      await StudentProfile.updateMany(
        { currentRoomAllocation: { $in: allocations.map((a) => a._id) } },
        { $unset: { currentRoomAllocation: undefined } },
        { session }
      );
      await RoomAllocation.deleteMany({ hostelId }).session(session);
      await Room.updateMany({ hostelId }, { occupancy: 0 }, { session });
      
      return success(null, 200, 'All allocations deleted');
    });
  }
}

export const hostelService = new HostelService();
