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
import { getHostelScope, isHostelAllowed } from '../../../../utils/hostelScope.js';

const toIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') {
    return value._id?.toString?.() || value.id?.toString?.() || value.toString?.() || null;
  }
  return String(value);
};

const shapeStudent = (allocation) => {
  const profile = allocation?.studentProfileId;
  if (!profile) return null;
  const user = profile.userId || {};
  return {
    id: profile._id,
    userId: user._id,
    name: user.name,
    email: user.email,
    profileImage: user.profileImage,
    rollNumber: profile.rollNumber,
    department: profile.department,
    bedNumber: allocation.bedNumber,
    allocationId: allocation._id,
  };
};

const isPopulated = (value) => Boolean(value && typeof value === "object" && (value.name || value.unitNumber || value.type))

const shapeRoom = (room, hostel, unit) => ({
  id: room._id,
  roomNumber: room.roomNumber,
  capacity: room.capacity,
  originalCapacity: room.originalCapacity ?? null,
  currentOccupancy: room.occupancy,
  status: room.status,
  hostel: isPopulated(hostel)
    ? { _id: hostel._id, name: hostel.name, type: hostel.type }
    : hostel || room.hostelId,
  unit: isPopulated(unit)
    ? { _id: unit._id, name: unit.unitNumber, unitNumber: unit.unitNumber }
    : unit || room.unitId,
  students: (room.allocations || []).map(shapeStudent).filter(Boolean),
});

class HostelRoomsService {
  /**
   * Get units for a hostel
   */
  async getUnits(hostelId, user) {
    if (user.hostel && user.hostel._id.toString() !== hostelId) {
      return forbidden('You do not have permission to access this hostel');
    }

    const unitsWithRooms = await hostelQueries.findUnitsWithRooms(hostelId);

    const finalResult = unitsWithRooms.map((unit) => {
      const hostel = unit.hostelId;
      return {
        id: unit._id,
        unitNumber: unit.unitNumber,
        hostel: hostel?.name,
        floor: unit.floor,
        commonAreaDetails: unit.commonAreaDetails,
        roomCount: unit.roomCount,
        capacity: unit.capacity,
        occupancy: unit.occupancy,
        rooms: (unit.rooms || []).map((room) => shapeRoom(room, hostel, unit)),
      };
    });

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

    const finalResults = roomsWithStudents.map((room) =>
      shapeRoom(room, room.hostelId, room.unitId),
    );

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

    const finalResult = roomsWithStudents.map((room) =>
      shapeRoom(room, room.hostelId, room.unitId),
    );

    return success(finalResult, 200, 'Rooms fetched successfully');
  }

  /**
   * Hostel-bound staff may only mutate rooms in their active hostel.
   */
  async assertRoomInScope(roomId, user) {
    const scope = getHostelScope(user);
    if (!scope.hostelBound) return null;

    const room = await hostelQueries.findRoomById(roomId, { select: 'hostelId' });
    if (!room) return notFound('Room not found');
    if (!isHostelAllowed(room.hostelId, scope)) {
      return forbidden('You can only update rooms in your active hostel');
    }
    return null;
  }

  /**
   * Update room status
   */
  async updateRoomStatus(roomId, status, user) {
    const scoped = await this.assertRoomInScope(roomId, user);
    if (scoped) return scoped;
    return roomOwner.setRoomStatus(roomId, status, { manualStatuses: MANUAL_ROOM_STATUSES });
  }

  /**
   * Allocate room to student.
   * Hostel-bound roles may only allocate into their active hostel.
   * (roomOwner.allocate requires an Active hosteller and replaces an occupied bed.)
   */
  async allocateRoom(allocationData, user) {
    const scope = getHostelScope(user);
    const hostelId = toIdString(allocationData?.hostelId);
    const unitId = toIdString(allocationData?.unitId);
    const roomId = toIdString(allocationData?.roomId);
    const studentId = toIdString(allocationData?.studentId);
    const userId = toIdString(allocationData?.userId);

    if (scope.hostelBound && !isHostelAllowed(hostelId, scope)) {
      return forbidden('You can only allocate students in your active hostel');
    }

    return roomOwner.allocate({
      ...allocationData,
      hostelId,
      unitId: unitId || undefined,
      roomId,
      studentId,
      userId,
    });
  }

  /**
   * Delete room allocation.
   * Hostel-bound roles may only remove allocations in their active hostel.
   */
  async deleteAllocation(allocationId, user) {
    const scope = getHostelScope(user);
    if (scope.hostelBound) {
      const allocation = await hostelQueries.findAllocationByIdWithRoom(allocationId);
      if (!allocation) {
        return notFound('Allocation not found');
      }
      const hostelId = toIdString(allocation.hostelId?._id || allocation.hostelId);
      if (!isHostelAllowed(hostelId, scope)) {
        return forbidden('You can only remove allocations in your active hostel');
      }
    }

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
  async updateRoom(roomId, updateData, user) {
    const scoped = await this.assertRoomInScope(roomId, user);
    if (scoped) return scoped;

    const { status } = updateData;
    const capacity = updateData.capacity === undefined || updateData.capacity === null
      ? null
      : Number(updateData.capacity);

    if (!MANUAL_ROOM_STATUSES.includes(status)) {
      return badRequest('Invalid status value ("Guest" is set automatically for accommodation bookings)');
    }

    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      return badRequest('Capacity must be a positive integer');
    }

    if (status === 'Active') {
      const activated = await roomOwner.setRoomStatus(roomId, 'Active', { manualStatuses: MANUAL_ROOM_STATUSES });
      if (!activated.success) return activated;
      // Setting capacity below current occupancy force-vacates the highest beds.
      if (capacity !== null) {
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
