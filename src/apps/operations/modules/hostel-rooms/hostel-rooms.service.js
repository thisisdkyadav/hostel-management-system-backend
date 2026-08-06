/**
 * Hostel Rooms Service
 * Room, unit, and allocation operations under /api/v1/hostel.
 *
 * This module owns no direct model access: writes go through roomOwner and reads
 * through hostelQueries, so Hostel/Room/Unit/RoomAllocation are touched only
 * inside src/services/hostel/. This service keeps the request-facing shaping and
 * permission checks.
 */

import {
  success,
  notFound,
  badRequest,
  forbidden,
} from '../../../../services/base/index.js';
import { MANUAL_ROOM_STATUSES } from '../../../../models/hostel/Room.model.js';
import { roomOwner } from '../../../../services/hostel/roomOwner.service.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';

class HostelRoomsService {
  /**
   * Get units for a hostel
   */
  async getUnits(hostelId, user) {
    if (user.hostel && user.hostel._id.toString() !== hostelId) {
      return forbidden('You do not have permission to access this hostel');
    }

    const unitsWithRooms = await hostelQueries.findUnitsWithRooms(hostelId);

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

    return success(finalResult);
  }

  /**
   * Get rooms by unit
   */
  async getRoomsByUnit(unitId, user) {
    const roomsWithStudents = await hostelQueries.findRoomsByUnitWithAllocations(unitId);

    if (
      roomsWithStudents.length
      && user.hostel
      && user.hostel._id.toString() !== roomsWithStudents[0].hostelId._id.toString()
    ) {
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
        allocationId: allocation._id,
      })) || [],
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

    const roomsWithStudents = await hostelQueries.findRoomsByHostelWithAllocations(hostelId);

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
        allocationId: allocation._id,
      })) || [],
    }));

    return success(finalResult, 200, 'Rooms fetched successfully');
  }

  /**
   * Update room status
   */
  async updateRoomStatus(roomId, status) {
    return roomOwner.setRoomStatus(roomId, status, { manualStatuses: MANUAL_ROOM_STATUSES });
  }

  /**
   * Allocate room to student
   */
  async allocateRoom(allocationData) {
    return roomOwner.allocate(allocationData);
  }

  /**
   * Delete room allocation
   */
  async deleteAllocation(allocationId) {
    return roomOwner.deallocate(allocationId);
  }

  /**
   * Get rooms for edit
   */
  async getRoomsForEdit(hostelId) {
    const rooms = await hostelQueries.findRoomsForEdit(hostelId);

    const finalResult = rooms.map((room) => ({
      id: room._id,
      unitNumber: room.unitId ? room.unitId.unitNumber : null,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      status: room.status,
    }));

    return success(finalResult, 200, 'Rooms fetched successfully');
  }

  /**
   * Update room
   */
  async updateRoom(roomId, updateData) {
    const { capacity, status } = updateData;

    if (!MANUAL_ROOM_STATUSES.includes(status)) {
      return badRequest('Invalid status value ("Guest" is set automatically for accommodation bookings)');
    }

    if (status === 'Active') {
      const activated = await roomOwner.setRoomStatus(roomId, 'Active', { manualStatuses: MANUAL_ROOM_STATUSES });
      if (!activated.success) return activated;
      // Setting capacity below current occupancy force-vacates the highest beds.
      if (capacity !== undefined && capacity !== null) {
        const result = await roomOwner.setRoomCapacity(roomId, capacity);
        if (!result.success) return result;
        return success(result.data, 200, 'Room updated successfully');
      }
      return success(null, 200, 'Room updated successfully');
    }

    // Any non-active status deactivates the room and clears its allocations.
    const deactivated = await roomOwner.setRoomStatus(roomId, status, { manualStatuses: MANUAL_ROOM_STATUSES });
    if (!deactivated.success) return deactivated;
    return success(null, 200, 'Room updated successfully');
  }

  /**
   * Add rooms to hostel
   */
  async addRooms(hostelId, roomsData) {
    return roomOwner.addRooms(hostelId, roomsData);
  }

  /**
   * Bulk update rooms
   */
  async bulkUpdateRooms(hostelId, rooms) {
    const hostel = await hostelQueries.findHostelById(hostelId);
    if (!hostel) {
      return notFound('Hostel not found');
    }

    const roomsToActivate = [];
    const roomsToDeactivate = {}; // target status -> [roomId], so each label is applied as-is
    const roomsToUpdateCapacity = [];

    if (hostel.type === 'unit-based') {
      const uniqueUnits = [...new Set(rooms.map((room) => room.unitNumber))];
      const units = await hostelQueries.findUnitsByNumbers(hostelId, uniqueUnits);

      const unitMap = {};
      units.forEach((unit) => {
        unitMap[unit.unitNumber] = unit._id;
      });

      const roomsToUpdate = rooms.map((room) => room.roomNumber);
      const existingRooms = await hostelQueries.findRoomsByNumbersInUnits(
        hostelId,
        roomsToUpdate,
        Object.values(unitMap),
      );

      const filteredExistingRooms = existingRooms.filter((room) =>
        rooms.some(
          (r) => r.roomNumber === room.roomNumber && r.unitNumber === room.unitId.unitNumber,
        ),
      );

      uniqueUnits.forEach((unitNumber) => {
        const roomsInUnit = filteredExistingRooms.filter(
          (room) => room.unitId.unitNumber === unitNumber,
        );

        roomsInUnit.forEach((room) => {
          const roomData = rooms.find(
            (r) => r.roomNumber === room.roomNumber && r.unitNumber === room.unitId.unitNumber,
          );

          if (roomData) {
            if (roomData.status && room.status !== roomData.status && MANUAL_ROOM_STATUSES.includes(roomData.status)) {
              if (roomData.status === 'Active') {
                roomsToActivate.push(room._id);
              } else {
                (roomsToDeactivate[roomData.status] ||= []).push(room._id);
              }
            } else if (room.status === 'Active' && roomData.capacity && room.capacity !== roomData.capacity) {
              roomsToUpdateCapacity.push({ roomId: room._id, capacity: roomData.capacity });
            }
          }
        });
      });
    } else if (hostel.type === 'room-only') {
      const roomsToUpdate = rooms.map((room) => room.roomNumber);
      const existingRooms = await hostelQueries.findRoomsByNumbers(hostelId, roomsToUpdate);

      existingRooms.forEach((room) => {
        const roomData = rooms.find((r) => r.roomNumber === room.roomNumber);
        if (roomData) {
          if (roomData.status && room.status !== roomData.status && MANUAL_ROOM_STATUSES.includes(roomData.status)) {
            if (roomData.status === 'Active') {
              roomsToActivate.push(room._id);
            } else {
              (roomsToDeactivate[roomData.status] ||= []).push(room._id);
            }
          } else if (room.status === 'Active' && roomData.capacity && room.capacity !== roomData.capacity) {
            roomsToUpdateCapacity.push({ roomId: room._id, capacity: roomData.capacity });
          }
        }
      });
    } else {
      return badRequest('Unsupported hostel type');
    }

    const roomsToDeactivateIds = Object.values(roomsToDeactivate).flat();

    if (
      roomsToActivate.length === 0
      && roomsToDeactivateIds.length === 0
      && roomsToUpdateCapacity.length === 0
    ) {
      return success(null, 200, 'No rooms to update');
    }

    const updatedRoomIds = [];

    // All writes go through the owner: activation restores capacity atomically,
    // deactivation zeroes capacity/occupancy and vacates allocations, and capacity
    // changes force-vacate the highest beds if the new capacity is below occupancy.
    if (roomsToActivate.length > 0) {
      await roomOwner.activateRooms(roomsToActivate);
      updatedRoomIds.push(...roomsToActivate);
    }

    for (const [status, ids] of Object.entries(roomsToDeactivate)) {
      if (ids.length === 0) continue;
      await roomOwner.deactivateRooms(ids, status);
      updatedRoomIds.push(...ids);
    }

    if (roomsToUpdateCapacity.length > 0) {
      await roomOwner.setRoomsCapacity(roomsToUpdateCapacity);
      updatedRoomIds.push(...roomsToUpdateCapacity.map((room) => room.roomId));
    }

    return success({ updatedRoomIds }, 200, 'Rooms updated successfully');
  }

  /**
   * Change hostel archive status
   */
  async changeArchiveStatus(hostelId, status) {
    return roomOwner.archiveHostel(hostelId, status);
  }

  /**
   * Delete all allocations for a hostel
   */
  async deleteAllAllocations(hostelId) {
    return roomOwner.deleteAllAllocations(hostelId);
  }
}

export const hostelRoomsService = new HostelRoomsService();
export default hostelRoomsService;
