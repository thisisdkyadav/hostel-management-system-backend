import mongoose from 'mongoose';
import { Hostel, Room, RoomAllocation, StudentProfile, Unit } from '../../../../models/index.js';
import { badRequest, notFound } from '../../../../services/base/index.js';
import { asyncHandler, sendStandardResponse } from '../../../../utils/index.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

export const updateRoomAllocations = asyncHandler(async (req, res) => {
  const { hostelId } = req.params;
  const allocationsData = req.body;
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const allocations = Array.isArray(allocationsData) ? allocationsData : [allocationsData];
    if (allocations.length > MAX_BULK_RECORDS) {
      await session.abortTransaction();
      return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`));
    }
    const results = [];
    const errors = [];

    const hostelData = await Hostel.findById(hostelId).session(session);
    if (!hostelData) {
      await session.abortTransaction();
      return sendStandardResponse(res, notFound('Hostel not found'));
    }

    const selectedHostelType = hostelData.type;
    const requiredFields = selectedHostelType === 'unit-based'
      ? ['unit', 'room', 'bedNumber', 'rollNumber']
      : ['room', 'bedNumber', 'rollNumber'];

    const validAllocations = [];
    for (const alloc of allocations) {
      const { unit, room, bedNumber, rollNumber } = alloc;

      let missingFields = false;
      if (selectedHostelType === 'unit-based') {
        if (!unit || !room || bedNumber === undefined || !rollNumber) missingFields = true;
      } else if (!room || bedNumber === undefined || !rollNumber) {
        missingFields = true;
      }

      if (missingFields) {
        errors.push({
          rollNumber: rollNumber || 'Unknown',
          message: `Missing required fields: ${requiredFields.join(', ')}`,
        });
      } else {
        validAllocations.push({ ...alloc, rollNumber: rollNumber.toUpperCase() });
      }
    }

    if (validAllocations.length === 0) {
      await session.abortTransaction();
      return sendStandardResponse(res, badRequest('No valid allocation data provided'));
    }

    const rollNumbers = validAllocations.map((a) => a.rollNumber);
    const studentProfiles = await StudentProfile.find({ rollNumber: { $in: rollNumbers } }).session(session);

    const profileMap = {};
    studentProfiles.forEach((profile) => {
      profileMap[profile.rollNumber] = profile;
    });

    const unitMap = {};
    const roomMap = {};
    let rooms = [];

    if (selectedHostelType === 'unit-based') {
      const unitNumbers = [...new Set(validAllocations.map((a) => a.unit))];
      const units = await Unit.find({ unitNumber: { $in: unitNumbers }, hostelId }).session(session);

      units.forEach((unit) => {
        unitMap[unit.unitNumber] = unit;
      });

      const unitIds = units.map((unit) => unit._id);
      const roomNumbers = [...new Set(validAllocations.map((a) => a.room))];
      rooms = await Room.find({ unitId: { $in: unitIds }, roomNumber: { $in: roomNumbers } }).session(session);

      rooms.forEach((room) => {
        const unitNumber = units.find((u) => u._id.equals(room.unitId))?.unitNumber;
        if (unitNumber) roomMap[`${unitNumber}:${room.roomNumber}`] = room;
      });
    } else {
      const roomNumbers = [...new Set(validAllocations.map((a) => a.room))];
      rooms = await Room.find({ hostelId, roomNumber: { $in: roomNumbers }, unitId: { $exists: false } }).session(session);

      rooms.forEach((room) => {
        roomMap[room.roomNumber] = room;
      });
    }

    const roomIds = rooms.map((room) => room._id);
    const bedNumbers = validAllocations.map((a) => a.bedNumber);
    const existingAllocations = await RoomAllocation.find({
      roomId: { $in: roomIds },
      bedNumber: { $in: bedNumbers },
    }).session(session);

    const existingAllocMap = {};
    existingAllocations.forEach((alloc) => {
      existingAllocMap[`${alloc.roomId}:${alloc.bedNumber}`] = alloc;
    });

    const studentIds = studentProfiles.map((profile) => profile._id);
    const currentAllocations = await RoomAllocation.find({ studentProfileId: { $in: studentIds } }).session(session);

    const currentAllocMap = {};
    currentAllocations.forEach((alloc) => {
      currentAllocMap[alloc.studentProfileId.toString()] = alloc;
    });

    const allocationsToDelete = [];
    const allocationsToCreate = [];

    for (const alloc of validAllocations) {
      const { unit, room, bedNumber, rollNumber } = alloc;

      const studentProfile = profileMap[rollNumber];
      if (!studentProfile) {
        errors.push({ rollNumber, message: 'Student profile not found' });
        continue;
      }

      let roomDoc = null;

      if (selectedHostelType === 'unit-based') {
        const unitDoc = unitMap[unit];
        if (!unitDoc) {
          errors.push({ rollNumber, message: 'Unit not found' });
          continue;
        }

        roomDoc = roomMap[`${unit}:${room}`];
        if (!roomDoc) {
          errors.push({ rollNumber, message: 'Room not found in specified unit' });
          continue;
        }
      } else {
        roomDoc = roomMap[room];
        if (!roomDoc) {
          errors.push({ rollNumber, message: 'Room not found' });
          continue;
        }
      }

      if (roomDoc.status !== 'Active') {
        errors.push({ rollNumber, message: 'Room is not active' });
        continue;
      }

      const existingAlloc = existingAllocMap[`${roomDoc._id}:${bedNumber}`];
      if (existingAlloc) allocationsToDelete.push(existingAlloc._id);

      const currentAlloc = currentAllocMap[studentProfile._id.toString()];
      if (currentAlloc && (!currentAlloc.roomId.equals(roomDoc._id) || currentAlloc.bedNumber !== bedNumber)) {
        allocationsToDelete.push(currentAlloc._id);
      }

      const newAllocation = new RoomAllocation({
        userId: studentProfile.userId,
        studentProfileId: studentProfile._id,
        hostelId: roomDoc.hostelId,
        roomId: roomDoc._id,
        unitId: roomDoc.unitId,
        bedNumber,
      });

      allocationsToCreate.push(newAllocation);
      results.push({ rollNumber, allocation: newAllocation });
    }

    if (allocationsToDelete.length > 0) {
      await RoomAllocation.deleteMany({ _id: { $in: allocationsToDelete } }).session(session);
    }

    if (allocationsToCreate.length > 0) {
      await RoomAllocation.insertMany(allocationsToCreate, { session });
    }

    await session.commitTransaction();

    const responseStatus = errors.length > 0 ? 207 : 200;
    return sendStandardResponse(res, {
      success: true,
      statusCode: responseStatus,
      data: {
        allocations: results,
        errors,
      },
      message: errors.length > 0
        ? 'Room allocations updated with some errors. Please review the errors for details.'
        : 'Room allocations updated successfully',
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
});

export const profilesAdminAllocationsModule = {
  updateRoomAllocations,
};

export default profilesAdminAllocationsModule;
