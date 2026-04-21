import mongoose from 'mongoose';
import { Configuration, Room, RoomAllocation, StudentProfile } from '../../../../models/index.js';
import { badRequest } from '../../../../services/base/index.js';
import {
  asyncHandler,
  buildBatchScopeStudentMatch,
  hasConfiguredBatch,
  MIXED_BATCH_SCOPE_KEY,
  sendStandardResponse,
} from '../../../../utils/index.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

const BATCH_ASSIGNMENT_MODE_APPEND = 'append';
const BATCH_ASSIGNMENT_MODE_REPLACE = 'replace';
const GROUP_ASSIGNMENT_MODE_ADD = 'add';
const GROUP_ASSIGNMENT_MODE_REMOVE = 'remove';
const GROUP_ASSIGNMENT_MODE_REPLACE = 'replace';
const STUDENT_STATUS_ACTIVE = 'Active';
const VALID_STUDENT_STATUSES = new Set([STUDENT_STATUS_ACTIVE, 'Graduated', 'Dropped', 'Inactive']);

const normalizeRollNumber = (value) => (
  typeof value === 'string' ? value.trim().toUpperCase() : ''
);

const isNumericRollNumber = (value = '') => /^\d+$/.test(value);

const resolveBatchAssignmentRollNumbers = async ({ session, rollNumbers, rollNumberRange }) => {
  const normalizedRollNumbers = Array.isArray(rollNumbers)
    ? [...new Set(rollNumbers.map(normalizeRollNumber).filter(Boolean))]
    : [];

  if (normalizedRollNumbers.length > 0) {
    if (normalizedRollNumbers.length > MAX_BULK_RECORDS) {
      return {
        success: false,
        message: `Maximum ${MAX_BULK_RECORDS} records are allowed per request`,
      };
    }

    return {
      success: true,
      rollNumbers: normalizedRollNumbers,
      selectionMode: 'csv',
    };
  }

  const normalizedRangeStart = normalizeRollNumber(rollNumberRange?.start);
  const normalizedRangeEnd = normalizeRollNumber(rollNumberRange?.end);

  if (!normalizedRangeStart || !normalizedRangeEnd) {
    return {
      success: false,
      message: 'Please provide either roll numbers or a roll number range',
    };
  }

  if (!isNumericRollNumber(normalizedRangeStart) || !isNumericRollNumber(normalizedRangeEnd)) {
    return {
      success: false,
      message: 'Roll number range is supported only for purely numeric roll numbers',
    };
  }

  const startValue = BigInt(normalizedRangeStart);
  const endValue = BigInt(normalizedRangeEnd);

  if (startValue > endValue) {
    return {
      success: false,
      message: 'Range start must be less than or equal to range end',
    };
  }

  const numericStudents = await StudentProfile.find({ rollNumber: /^\d+$/ })
    .select('rollNumber')
    .session(session)
    .lean();

  const rangedRollNumbers = numericStudents
    .filter((student) => {
      const currentValue = BigInt(student.rollNumber);
      return currentValue >= startValue && currentValue <= endValue;
    })
    .map((student) => student.rollNumber)
    .sort((left, right) => {
      const leftValue = BigInt(left);
      const rightValue = BigInt(right);
      if (leftValue === rightValue) return 0;
      return leftValue < rightValue ? -1 : 1;
    });

  if (rangedRollNumbers.length === 0) {
    return {
      success: false,
      message: 'No numeric students found in the provided roll number range',
    };
  }

  if (rangedRollNumbers.length > MAX_BULK_RECORDS) {
    return {
      success: false,
      message: `Range resolved to ${rangedRollNumbers.length} students. Maximum ${MAX_BULK_RECORDS} records are allowed per request`,
    };
  }

  return {
    success: true,
    rollNumbers: rangedRollNumbers,
    selectionMode: 'range',
  };
};

const normalizeGroupNames = (values = []) => (
  [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
  )]
);

const deallocateStudentProfiles = async ({ studentProfileIds = [], session }) => {
  if (!Array.isArray(studentProfileIds) || studentProfileIds.length === 0) {
    return 0;
  }

  const allocations = await RoomAllocation.find({
    studentProfileId: { $in: studentProfileIds },
  })
    .select('_id roomId')
    .session(session)
    .lean();

  if (!allocations.length) {
    return 0;
  }

  const allocationIds = allocations.map((allocation) => allocation._id);
  await StudentProfile.updateMany(
    { currentRoomAllocation: { $in: allocationIds } },
    { $unset: { currentRoomAllocation: '' } },
    { session }
  );

  const roomUpdates = {};
  allocations.forEach((allocation) => {
    const roomId = allocation.roomId?.toString();
    if (!roomId) return;
    roomUpdates[roomId] = (roomUpdates[roomId] || 0) + 1;
  });

  const roomBulkOps = Object.entries(roomUpdates).map(([roomId, count]) => ({
    updateOne: {
      filter: { _id: roomId },
      update: { $inc: { occupancy: -count } },
    },
  }));

  if (roomBulkOps.length > 0) {
    await Room.bulkWrite(roomBulkOps, { session });
  }

  const deleteResult = await RoomAllocation.collection.deleteMany(
    { _id: { $in: allocationIds } },
    { session }
  );

  return deleteResult?.deletedCount || 0;
};

export const bulkUpdateStudentsStatus = asyncHandler(async (req, res) => {
  const { status, rollNumbers } = req.body;
  const normalizedStatus = typeof status === 'string' ? status.trim() : '';
  const normalizedRollNumbers = Array.isArray(rollNumbers)
    ? [...new Set(rollNumbers.map(normalizeRollNumber).filter(Boolean))]
    : [];

  if (!normalizedStatus) {
    return sendStandardResponse(res, badRequest('Status is required'));
  }

  if (!VALID_STUDENT_STATUSES.has(normalizedStatus)) {
    return sendStandardResponse(res, badRequest('Invalid status value'));
  }

  if (normalizedRollNumbers.length === 0) {
    return sendStandardResponse(res, badRequest('Please provide at least one roll number'));
  }
  if (normalizedRollNumbers.length > MAX_BULK_RECORDS) {
    return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`));
  }

  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const existingStudents = await StudentProfile.find({ rollNumber: { $in: normalizedRollNumbers } })
        .select('_id rollNumber')
        .session(session)
        .lean();
      const existingRollNumbers = existingStudents.map((student) => student.rollNumber);
      const existingRollNumberSet = new Set(existingRollNumbers);
      const unsuccessfulRollNumbers = normalizedRollNumbers.filter((rollNumber) => !existingRollNumberSet.has(rollNumber));

      if (existingStudents.length === 0) {
        responsePayload = {
          success: false,
          statusCode: 404,
          message: 'No students found to update',
          errors: unsuccessfulRollNumbers.map((rollNumber) => ({
            rollNumber,
            message: 'Student not found',
          })),
        };
        return;
      }

      const studentProfileIds = existingStudents.map((student) => student._id);

      const students = await StudentProfile.updateMany(
        { _id: { $in: studentProfileIds } },
        { $set: { status: normalizedStatus } },
        { session }
      );

      const deallocatedCount = normalizedStatus !== STUDENT_STATUS_ACTIVE
        ? await deallocateStudentProfiles({ studentProfileIds, session })
        : 0;

      responsePayload = {
        success: true,
        statusCode: 200,
        data: {
          updatedCount: students.modifiedCount,
          matchedCount: students.matchedCount,
          deallocatedCount,
          unsuccessfulRollNumbers,
        },
        message: 'Students status updated successfully',
      };
    });

    return sendStandardResponse(res, responsePayload);
  } finally {
    await session.endSession();
  }
});

export const checkMissingRollNumbers = asyncHandler(async (req, res) => {
  const submittedRollNumbers = Array.isArray(req.body?.rollNumbers) ? req.body.rollNumbers : [];
  const scopeType = typeof req.body?.scopeType === 'string' ? req.body.scopeType : 'system';
  const normalizedRollNumbers = [...new Set(submittedRollNumbers.map(normalizeRollNumber).filter(Boolean))];

  if (normalizedRollNumbers.length === 0) {
    return sendStandardResponse(res, badRequest('Please provide at least one valid roll number'));
  }

  if (normalizedRollNumbers.length > MAX_BULK_RECORDS) {
    return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`));
  }

  const existingStudents = await StudentProfile.find({ rollNumber: { $in: normalizedRollNumbers } })
    .select('rollNumber degree department batch groups status')
    .lean();

  const existingStudentMap = new Map(existingStudents.map((student) => [student.rollNumber, student]));
  const existingRollNumbers = normalizedRollNumbers.filter((rollNumber) => existingStudentMap.has(rollNumber));
  const existingRollNumberSet = new Set(existingRollNumbers);
  const missingRollNumbers = normalizedRollNumbers.filter((rollNumber) => !existingRollNumberSet.has(rollNumber));
  const statusCounts = existingRollNumbers.reduce((counts, rollNumber) => {
    const status = String(existingStudentMap.get(rollNumber)?.status || 'Unknown').trim() || 'Unknown';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const statusRollNumbers = existingRollNumbers.reduce((groups, rollNumber) => {
    const status = String(existingStudentMap.get(rollNumber)?.status || 'Unknown').trim() || 'Unknown';
    if (!groups[status]) {
      groups[status] = [];
    }
    groups[status].push(rollNumber);
    return groups;
  }, {});
  let outOfScopeRollNumbers = [];
  let inScopeCount = existingRollNumbers.length;
  let scopeLabel = 'System';

  if (scopeType === 'group') {
    const groupName = typeof req.body?.groupName === 'string' ? req.body.groupName.trim() : '';
    if (!groupName) {
      return sendStandardResponse(res, badRequest('groupName is required when checking against a group'));
    }

    const studentGroupsConfig = await Configuration.findOne({ key: 'studentGroups' }).lean();
    const configuredGroups = normalizeGroupNames(studentGroupsConfig?.value || []);
    const normalizedGroupName = configuredGroups.find((group) => group.toLowerCase() === groupName.toLowerCase()) || groupName;

    if (!configuredGroups.some((group) => group.toLowerCase() === normalizedGroupName.toLowerCase())) {
      return sendStandardResponse(res, badRequest(`Group "${groupName}" is not configured`));
    }

    outOfScopeRollNumbers = existingRollNumbers.filter((rollNumber) => {
      const student = existingStudentMap.get(rollNumber);
      const studentGroups = normalizeGroupNames(student?.groups || []);
      return !studentGroups.some((group) => group.toLowerCase() === normalizedGroupName.toLowerCase());
    });
    inScopeCount = existingRollNumbers.length - outOfScopeRollNumbers.length;
    scopeLabel = `Group: ${normalizedGroupName}`;
  } else if (scopeType === 'batch') {
    const degree = typeof req.body?.degree === 'string' ? req.body.degree.trim() : '';
    const department = typeof req.body?.department === 'string' ? req.body.department.trim() : '';
    const batch = typeof req.body?.batch === 'string' ? req.body.batch.trim() : '';

    if (!degree || !department || !batch) {
      return sendStandardResponse(res, badRequest('degree, department, and batch are required when checking against a batch'));
    }

    const studentBatchesConfig = await Configuration.findOne({ key: 'studentBatches' }).lean();
    const configuredBatches = studentBatchesConfig?.value || {};

    if (!hasConfiguredBatch(configuredBatches, { degree, department, batch })) {
      return sendStandardResponse(res, badRequest('The selected batch is not configured for the selected academic combination'));
    }

    const batchScopeMatch = buildBatchScopeStudentMatch({ degree, department, batch });
    outOfScopeRollNumbers = existingRollNumbers.filter((rollNumber) => {
      const student = existingStudentMap.get(rollNumber) || {};
      return Object.entries(batchScopeMatch).some(([key, value]) => String(student?.[key] || '').trim() !== value);
    });
    inScopeCount = existingRollNumbers.length - outOfScopeRollNumbers.length;
    scopeLabel = `Batch: ${batch} (${degree === MIXED_BATCH_SCOPE_KEY ? 'Mixed Degree' : degree} / ${department === MIXED_BATCH_SCOPE_KEY ? 'Mixed Department' : department})`;
  }

  return sendStandardResponse(res, {
    success: true,
    statusCode: 200,
    data: {
      submittedCount: submittedRollNumbers.length,
      uniqueCount: normalizedRollNumbers.length,
      foundCount: existingRollNumbers.length,
      statusCounts,
      statusRollNumbers,
      missingCount: missingRollNumbers.length,
      missingRollNumbers,
      scopeType,
      scopeLabel,
      inScopeCount,
      outOfScopeCount: outOfScopeRollNumbers.length,
      outOfScopeRollNumbers,
    },
    message:
      missingRollNumbers.length > 0 || outOfScopeRollNumbers.length > 0
        ? 'Roll number check completed with unmatched records'
        : 'All uploaded roll numbers matched the selected check',
  });
});

export const bulkUpdateDayScholarDetails = asyncHandler(async (req, res) => {
  const { data } = req.body;

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return sendStandardResponse(res, badRequest('Invalid day scholar payload'));
  }

  const normalizedEntries = Object.entries(data).reduce((entries, [rawRollNumber, studentData]) => {
    const rollNumber = typeof rawRollNumber === 'string' ? rawRollNumber.trim().toUpperCase() : '';

    if (!rollNumber) {
      return entries;
    }

    entries[rollNumber] = studentData;
    return entries;
  }, {});

  const rollNumbers = Object.keys(normalizedEntries);

  if (rollNumbers.length === 0) {
    return sendStandardResponse(res, badRequest('Please provide at least one valid roll number'));
  }

  if (rollNumbers.length > MAX_BULK_RECORDS) {
    return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`));
  }

  const results = [];
  const errors = [];
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const students = await StudentProfile.find({ rollNumber: { $in: rollNumbers } }).session(session);

    const studentMap = new Map();
    students.forEach((student) => {
      studentMap.set(student.rollNumber, student);
    });

    const bulkOperations = [];
    const studentProfileIdsToDeallocate = [];

    for (const [rollNumber, studentData] of Object.entries(normalizedEntries)) {
      const student = studentMap.get(rollNumber);

      if (!student) {
        errors.push({ rollNumber, error: 'Student not found' });
        continue;
      }

      const { isDayScholar, dayScholarDetails } = studentData;
      const shouldBeDayScholar = isDayScholar === true;

      if (shouldBeDayScholar) {
        const nextDayScholarDetails = (
          dayScholarDetails && typeof dayScholarDetails === 'object' && !Array.isArray(dayScholarDetails)
        ) ? {
            address: dayScholarDetails.address || '',
            ownerName: dayScholarDetails.ownerName || '',
            ownerPhone: dayScholarDetails.ownerPhone || '',
            ownerEmail: dayScholarDetails.ownerEmail || '',
          }
          : null;

        bulkOperations.push({
          updateOne: {
            filter: { _id: student._id },
            update: {
              $set: {
                isDayScholar: true,
                dayScholarDetails: nextDayScholarDetails,
              },
            },
          },
        });

        studentProfileIdsToDeallocate.push(student._id);
        results.push({ rollNumber, success: true, isDayScholar: true });
      } else {
        bulkOperations.push({
          updateOne: {
            filter: { _id: student._id },
            update: {
              $set: { isDayScholar: false },
              $unset: { dayScholarDetails: 1 },
            },
          },
        });

        results.push({ rollNumber, success: true, isDayScholar: false });
      }
    }

    if (bulkOperations.length > 0) {
      await StudentProfile.bulkWrite(bulkOperations, { session, ordered: false });
    }

    const deallocatedCount = await deallocateStudentProfiles({
      studentProfileIds: studentProfileIdsToDeallocate,
      session,
    });

    await session.commitTransaction();

    const responseStatus = errors.length > 0 ? 207 : 200;
    return sendStandardResponse(res, {
      success: true,
      statusCode: responseStatus,
      data: {
        results,
        errors,
        deallocatedCount,
      },
      message: errors.length > 0
        ? 'Day scholar details updated with some errors. Please review the errors for details.'
        : 'Day scholar details updated successfully',
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
});

export const bulkUpdateStudentsBatch = asyncHandler(async (req, res) => {
  const {
    degree,
    department,
    batch,
    rollNumbers,
    rollNumberRange,
    assignmentMode = BATCH_ASSIGNMENT_MODE_APPEND,
  } = req.body;

  if (!degree || !department || !batch) {
    return sendStandardResponse(res, badRequest('degree, department, and batch are required'));
  }

  if (![BATCH_ASSIGNMENT_MODE_APPEND, BATCH_ASSIGNMENT_MODE_REPLACE].includes(assignmentMode)) {
    return sendStandardResponse(res, badRequest('assignmentMode must be either append or replace'));
  }

  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const selectionResult = await resolveBatchAssignmentRollNumbers({
        session,
        rollNumbers,
        rollNumberRange,
      });

      if (!selectionResult.success) {
        responsePayload = badRequest(selectionResult.message);
        return;
      }

      const normalizedRollNumbers = selectionResult.rollNumbers;
      const studentBatchesConfig = await Configuration.findOne({ key: 'studentBatches' }).session(session);
      const configuredBatches = studentBatchesConfig?.value || {};

      if (!hasConfiguredBatch(configuredBatches, { degree, department, batch })) {
        responsePayload = badRequest('The selected batch is not configured for the selected academic combination');
        return;
      }

      const existingStudents = await StudentProfile.find({ rollNumber: { $in: normalizedRollNumbers } })
        .select('rollNumber')
        .session(session);
      const existingRollNumbers = existingStudents.map((student) => student.rollNumber);
      const unsuccessfulRollNumbers = normalizedRollNumbers.filter((rollNumber) => !existingRollNumbers.includes(rollNumber));
      const updateFields = { batch };
      let clearedCount = 0;

      if (degree !== MIXED_BATCH_SCOPE_KEY) {
        updateFields.degree = degree;
      }

      if (department !== MIXED_BATCH_SCOPE_KEY) {
        updateFields.department = department;
      }

      if (existingRollNumbers.length === 0) {
        responsePayload = {
          success: false,
          statusCode: 404,
          message: 'No students found to update',
          errors: unsuccessfulRollNumbers.map((rollNumber) => ({
            rollNumber,
            message: 'Student not found',
          })),
        };
        return;
      }

      if (assignmentMode === BATCH_ASSIGNMENT_MODE_REPLACE) {
        const clearedStudents = await StudentProfile.updateMany(
          buildBatchScopeStudentMatch({ degree, department, batch }),
          { $set: { batch: '' } },
          { session }
        );
        clearedCount = clearedStudents.modifiedCount || 0;
      }

      const students = await StudentProfile.updateMany(
        { rollNumber: { $in: existingRollNumbers } },
        { $set: updateFields },
        { session }
      );

      responsePayload = {
        success: true,
        statusCode: 200,
        data: {
          updatedCount: students.modifiedCount,
          matchedCount: students.matchedCount,
          clearedCount,
          unsuccessfulRollNumbers,
          selectionMode: selectionResult.selectionMode,
          assignmentMode,
          assignment: {
            degree,
            department,
            batch,
            appliedDegree: degree !== MIXED_BATCH_SCOPE_KEY ? degree : null,
            appliedDepartment: department !== MIXED_BATCH_SCOPE_KEY ? department : null,
          },
        },
        message: 'Students batch updated successfully',
      };
    });

    return sendStandardResponse(res, responsePayload);
  } finally {
    await session.endSession();
  }
});

export const bulkUpdateStudentsGroups = asyncHandler(async (req, res) => {
  const {
    groupNames,
    rollNumbers,
    rollNumberRange,
    assignmentMode = GROUP_ASSIGNMENT_MODE_ADD,
  } = req.body;

  const normalizedGroupNames = normalizeGroupNames(groupNames);

  if (normalizedGroupNames.length === 0) {
    return sendStandardResponse(res, badRequest('Please select at least one group'));
  }

  if (![GROUP_ASSIGNMENT_MODE_ADD, GROUP_ASSIGNMENT_MODE_REMOVE, GROUP_ASSIGNMENT_MODE_REPLACE].includes(assignmentMode)) {
    return sendStandardResponse(res, badRequest('assignmentMode must be add, remove, or replace'));
  }

  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const selectionResult = await resolveBatchAssignmentRollNumbers({
        session,
        rollNumbers,
        rollNumberRange,
      });

      if (!selectionResult.success) {
        responsePayload = badRequest(selectionResult.message);
        return;
      }

      const studentGroupsConfig = await Configuration.findOne({ key: 'studentGroups' }).session(session);
      const configuredGroups = normalizeGroupNames(studentGroupsConfig?.value || []);
      const configuredGroupsLookup = new Set(configuredGroups);
      const invalidGroups = normalizedGroupNames.filter((groupName) => !configuredGroupsLookup.has(groupName));

      if (invalidGroups.length > 0) {
        responsePayload = badRequest(`These groups are not configured: ${invalidGroups.join(', ')}`);
        return;
      }

      const normalizedRollNumbers = selectionResult.rollNumbers;
      const existingStudents = await StudentProfile.find({ rollNumber: { $in: normalizedRollNumbers } })
        .select('rollNumber')
        .session(session);
      const existingRollNumbers = existingStudents.map((student) => student.rollNumber);
      const unsuccessfulRollNumbers = normalizedRollNumbers.filter((rollNumber) => !existingRollNumbers.includes(rollNumber));

      if (existingRollNumbers.length === 0) {
        responsePayload = {
          success: false,
          statusCode: 404,
          message: 'No students found to update',
          errors: unsuccessfulRollNumbers.map((rollNumber) => ({
            rollNumber,
            message: 'Student not found',
          })),
        };
        return;
      }

      let students;
      let clearedCount = 0;

      if (assignmentMode === GROUP_ASSIGNMENT_MODE_ADD) {
        students = await StudentProfile.updateMany(
          { rollNumber: { $in: existingRollNumbers } },
          { $addToSet: { groups: { $each: normalizedGroupNames } } },
          { session }
        );
      } else if (assignmentMode === GROUP_ASSIGNMENT_MODE_REMOVE) {
        students = await StudentProfile.updateMany(
          { rollNumber: { $in: existingRollNumbers } },
          { $pull: { groups: { $in: normalizedGroupNames } } },
          { session }
        );
      } else {
        const clearedStudents = await StudentProfile.updateMany(
          { groups: { $in: normalizedGroupNames } },
          { $pull: { groups: { $in: normalizedGroupNames } } },
          { session }
        );
        clearedCount = clearedStudents.modifiedCount || 0;

        students = await StudentProfile.updateMany(
          { rollNumber: { $in: existingRollNumbers } },
          { $addToSet: { groups: { $each: normalizedGroupNames } } },
          { session }
        );
      }

      responsePayload = {
        success: true,
        statusCode: 200,
        data: {
          updatedCount: students.modifiedCount,
          matchedCount: students.matchedCount,
          clearedCount,
          unsuccessfulRollNumbers,
          selectionMode: selectionResult.selectionMode,
          assignmentMode,
          groups: normalizedGroupNames,
        },
        message: 'Student groups updated successfully',
      };
    });

    return sendStandardResponse(res, responsePayload);
  } finally {
    await session.endSession();
  }
});

export const profilesAdminBulkModule = {
  checkMissingRollNumbers,
  bulkUpdateStudentsStatus,
  bulkUpdateDayScholarDetails,
  bulkUpdateStudentsBatch,
  bulkUpdateStudentsGroups,
};

export default profilesAdminBulkModule;
