import mongoose from 'mongoose';
import { StudentProfile } from '../../../../models/index.js';
import { badRequest, notFound, success } from '../../../../services/base/index.js';
import { asyncHandler, sendStandardResponse } from '../../../../utils/index.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';
import { roomOwner } from '../../../../services/hostel/roomOwner.service.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';

const normalizeAllocationRollNumber = (rollNumber) => (
  typeof rollNumber === 'string' ? rollNumber.trim().toUpperCase() : ''
);

/**
 * Pull { roomId, bedNumber } out of a MongoDB duplicate-key error so the caller
 * can tell the admin the EXACT bed that clashed instead of a raw stack trace.
 * Handles both a single MongoServerError and the MongoBulkWriteError thrown by
 * insertMany, falling back to parsing the error message when keyValue is absent.
 */
const extractDuplicateBed = (error) => {
  const isDup =
    error?.code === 11000 ||
    (Array.isArray(error?.writeErrors) &&
      error.writeErrors.some((e) => (e?.code ?? e?.err?.code) === 11000));
  if (!isDup) return null;

  let keyValue = error?.keyValue;
  if (!keyValue && Array.isArray(error?.writeErrors) && error.writeErrors.length > 0) {
    const first = error.writeErrors[0];
    keyValue = first?.err?.keyValue || first?.keyValue;
  }
  if (keyValue && keyValue.roomId !== undefined && keyValue.bedNumber !== undefined) {
    return { roomId: String(keyValue.roomId), bedNumber: keyValue.bedNumber };
  }

  // Fallback: parse "dup key: { roomId: ObjectId('...'), bedNumber: 1 }".
  const message = error?.errmsg || error?.message || '';
  const roomMatch = message.match(/roomId:\s*ObjectId\('([0-9a-fA-F]{24})'\)/);
  const bedMatch = message.match(/bedNumber:\s*"?([^",}]+)"?/);
  if (roomMatch && bedMatch) {
    return { roomId: roomMatch[1], bedNumber: bedMatch[1].trim() };
  }
  return null;
};

export const getAllocationStudentByRollNumber = asyncHandler(async (req, res) => {
  const rollNumber = normalizeAllocationRollNumber(req.params.rollNumber);

  if (!rollNumber) {
    return sendStandardResponse(res, badRequest('Roll number is required'));
  }

  const studentProfile = await StudentProfile.findOne({ rollNumber })
    .populate('userId', 'name email profileImage')
    .populate({
      path: 'currentRoomAllocation',
      populate: [
        {
          path: 'hostelId',
          select: 'name type',
        },
        {
          path: 'roomId',
          select: 'roomNumber unitId',
          populate: {
            path: 'unitId',
            select: 'unitNumber',
          },
        },
      ],
    });

  if (!studentProfile) {
    return sendStandardResponse(res, notFound('Student profile not found'));
  }

  const currentAllocation = studentProfile.currentRoomAllocation
    ? {
        hostelId: studentProfile.currentRoomAllocation.hostelId?._id?.toString() || null,
        hostelName: studentProfile.currentRoomAllocation.hostelId?.name || null,
        hostelType: studentProfile.currentRoomAllocation.hostelId?.type || null,
        unitNumber: studentProfile.currentRoomAllocation.roomId?.unitId?.unitNumber || null,
        roomNumber: studentProfile.currentRoomAllocation.roomId?.roomNumber || null,
        bedNumber: studentProfile.currentRoomAllocation.bedNumber || null,
        allocationId: studentProfile.currentRoomAllocation._id?.toString() || null,
      }
    : null;

  return sendStandardResponse(res, success({
    student: {
      id: studentProfile._id?.toString() || null,
      userId: studentProfile.userId?._id?.toString() || null,
      rollNumber: studentProfile.rollNumber,
      name: studentProfile.userId?.name || null,
      email: studentProfile.userId?.email || null,
      profileImage: studentProfile.userId?.profileImage || null,
      status: studentProfile.status || null,
      currentAllocation,
    },
  }));
});

export const updateRoomAllocations = asyncHandler(async (req, res) => {
  const { hostelId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(hostelId)) {
    return sendStandardResponse(res, badRequest('A valid hostel must be selected'));
  }
  const allocationsData = req.body;
  // roomId -> human label (unit-room / room), populated once rooms are resolved.
  // Declared out here so the catch block can name the exact bed on a dup-key error.
  const roomLabelById = new Map();
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

    const hostelData = await hostelQueries.findHostelById(hostelId, { session });
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
        continue;
      }

      // Normalise bedNumber to the positive integer the schema expects. The
      // request body / CSV can deliver it as a string ("1"), and a string bed
      // silently defeats bed-conflict detection and the unique index downstream.
      const parsedBed = Number(bedNumber);
      if (!Number.isInteger(parsedBed) || parsedBed <= 0) {
        errors.push({
          rollNumber: rollNumber || 'Unknown',
          message: `Invalid bed number "${bedNumber}" - must be a positive whole number`,
        });
        continue;
      }

      validAllocations.push({ ...alloc, bedNumber: parsedBed, rollNumber: rollNumber.toUpperCase() });
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
    let units = [];

    if (selectedHostelType === 'unit-based') {
      const unitNumbers = [...new Set(validAllocations.map((a) => a.unit))];
      units = await hostelQueries.findUnitsByNumbers(hostelId, unitNumbers, { session });

      units.forEach((unit) => {
        unitMap[unit.unitNumber] = unit;
      });

      const unitIds = units.map((unit) => unit._id);
      const roomNumbers = [...new Set(validAllocations.map((a) => a.room))];
      rooms = await hostelQueries.findRoomsInUnitsByNumbers(unitIds, roomNumbers, { session });

      rooms.forEach((room) => {
        const unitNumber = units.find((u) => u._id.equals(room.unitId))?.unitNumber;
        if (unitNumber) roomMap[`${unitNumber}:${room.roomNumber}`] = room;
      });
    } else {
      const roomNumbers = [...new Set(validAllocations.map((a) => a.room))];
      rooms = await hostelQueries.findRoomOnlyByNumbers(hostelId, roomNumbers, { session });

      rooms.forEach((room) => {
        roomMap[room.roomNumber] = room;
      });
    }

    // Cache a readable label for every resolved room so a dup-key error can name
    // the exact bed instead of surfacing a raw roomId.
    rooms.forEach((room) => {
      const unitNumber =
        selectedHostelType === 'unit-based'
          ? units.find((u) => u._id.equals(room.unitId))?.unitNumber
          : null;
      roomLabelById.set(
        String(room._id),
        unitNumber ? `${unitNumber}-${room.roomNumber}` : `${room.roomNumber}`,
      );
    });

    const roomIds = rooms.map((room) => room._id);
    const bedNumbers = validAllocations.map((a) => a.bedNumber);
    const existingAllocations = await hostelQueries.findAllocationsByRoomsAndBeds(roomIds, bedNumbers, { session });

    const existingAllocMap = {};
    existingAllocations.forEach((alloc) => {
      existingAllocMap[`${alloc.roomId}:${alloc.bedNumber}`] = alloc;
    });

    const studentIds = studentProfiles.map((profile) => profile._id);
    const currentAllocations = await hostelQueries.findAllocationsByStudentProfiles(studentIds, { session });

    const currentAllocMap = {};
    currentAllocations.forEach((alloc) => {
      currentAllocMap[alloc.studentProfileId.toString()] = alloc;
    });

    // First pass: validate + resolve rooms + queue bed-conflict / stale-student
    // deletes (deduped) so capacity can be enforced net of the beds they free.
    const deleteMap = new Map();
    const queueDelete = (allocation) => deleteMap.set(String(allocation._id), allocation);
    const pending = [];

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
      if (existingAlloc) queueDelete(existingAlloc);

      const currentAlloc = currentAllocMap[studentProfile._id.toString()];
      if (currentAlloc && (!currentAlloc.roomId.equals(roomDoc._id) || currentAlloc.bedNumber !== bedNumber)) {
        queueDelete(currentAlloc);
      }

      pending.push({ rollNumber, studentProfile, roomDoc, bedNumber });
    }

    const allocationsToDelete = [...deleteMap.values()].map((a) => a._id);
    const deletesFromRoom = {};
    for (const a of deleteMap.values()) {
      const rid = a.roomId ? a.roomId.toString() : null;
      if (rid) deletesFromRoom[rid] = (deletesFromRoom[rid] || 0) + 1;
    }

    // Second pass: enforce capacity. Available beds in a room = capacity minus the
    // allocations that remain once the queued deletes free their beds. Overflow
    // allocations are reported as errors instead of silently over-filling the room.
    const availableByRoom = {};
    const claimedBeds = new Set();
    const createInputs = [];
    const createMeta = [];
    for (const { rollNumber, studentProfile, roomDoc, bedNumber } of pending) {
      const rid = roomDoc._id.toString();

      // Reject two rows in the SAME upload targeting the same bed. Without this
      // both reach insertMany and collide on the unique { roomId, bedNumber }
      // index - a cryptic E11000 instead of a clear per-row message.
      const bedKey = `${rid}:${bedNumber}`;
      if (claimedBeds.has(bedKey)) {
        errors.push({
          rollNumber,
          message: `Bed ${bedNumber} in room ${roomLabelById.get(rid) || roomDoc.roomNumber} is assigned to more than one student in this upload`,
        });
        continue;
      }

      if (availableByRoom[rid] === undefined) {
        availableByRoom[rid] = Math.max(
          0,
          roomDoc.capacity - (roomDoc.occupancy - (deletesFromRoom[rid] || 0)),
        );
      }
      if (availableByRoom[rid] <= 0) {
        errors.push({ rollNumber, message: 'Room is already at full capacity' });
        continue;
      }
      availableByRoom[rid] -= 1;
      claimedBeds.add(bedKey);
      createInputs.push({
        userId: studentProfile.userId,
        studentProfileId: studentProfile._id,
        hostelId: roomDoc.hostelId,
        roomId: roomDoc._id,
        unitId: roomDoc.unitId,
        bedNumber,
      });
      createMeta.push(rollNumber);
    }

    // Apply atomically through the owner: native delete + insert, then occupancy
    // is recomputed from ground truth for every affected room.
    const { createdDocs } = await roomOwner.applyAllocations(
      { deleteIds: allocationsToDelete, createInputs },
      session,
    );
    createdDocs.forEach((doc, index) => {
      results.push({ rollNumber: createMeta[index], allocation: doc });
    });

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

    // Turn a duplicate-bed collision into a precise, actionable message naming
    // the exact bed instead of leaking a MongoBulkWriteError / "Invalid ID" 500.
    const dup = extractDuplicateBed(error);
    if (dup) {
      const roomLabel = roomLabelById.get(dup.roomId) || `room ${dup.roomId}`;
      return sendStandardResponse(
        res,
        badRequest(
          `Bed ${dup.bedNumber} in room ${roomLabel} is already occupied. Deallocate the current occupant first, or choose a different bed.`,
        ),
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
});

export const profilesAdminAllocationsModule = {
  getAllocationStudentByRollNumber,
  updateRoomAllocations,
};

export default profilesAdminAllocationsModule;
