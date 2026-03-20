import mongoose from 'mongoose';
import { Configuration, StudentProfile } from '../../../../models/index.js';
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

export const bulkUpdateStudentsStatus = asyncHandler(async (req, res) => {
  const { status, rollNumbers } = req.body;

  if (!status) {
    return sendStandardResponse(res, badRequest('Status is required'));
  }

  if (!Array.isArray(rollNumbers) || rollNumbers.length === 0) {
    return sendStandardResponse(res, badRequest('Please provide at least one roll number'));
  }
  if (rollNumbers.length > MAX_BULK_RECORDS) {
    return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`));
  }

  const existingStudents = await StudentProfile.find({ rollNumber: { $in: rollNumbers } });
  const existingRollNumbers = existingStudents.map((student) => student.rollNumber);
  const unsuccessfulRollNumbers = rollNumbers.filter((rollNumber) => !existingRollNumbers.includes(rollNumber));

  const students = await StudentProfile.updateMany(
    { rollNumber: { $in: existingRollNumbers } },
    { status }
  );

  if (students.modifiedCount === 0) {
    return sendStandardResponse(res, {
      success: false,
      statusCode: 404,
      message: 'No students found to update',
      errors: unsuccessfulRollNumbers.map((rollNumber) => ({
        rollNumber,
        message: 'Student not found',
      })),
    });
  }

  return sendStandardResponse(res, {
    success: true,
    statusCode: 200,
    data: {
      updatedCount: students.modifiedCount,
      unsuccessfulRollNumbers,
    },
    message: 'Students status updated successfully',
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

    for (const [rollNumber, studentData] of Object.entries(normalizedEntries)) {
      const student = studentMap.get(rollNumber);

      if (!student) {
        errors.push({ rollNumber, error: 'Student not found' });
        continue;
      }

      const { isDayScholar, dayScholarDetails } = studentData;

      if (isDayScholar) {
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

    await session.commitTransaction();

    const responseStatus = errors.length > 0 ? 207 : 200;
    return sendStandardResponse(res, {
      success: true,
      statusCode: responseStatus,
      data: {
        results,
        errors,
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

export const profilesAdminBulkModule = {
  bulkUpdateStudentsStatus,
  bulkUpdateDayScholarDetails,
  bulkUpdateStudentsBatch,
};

export default profilesAdminBulkModule;
