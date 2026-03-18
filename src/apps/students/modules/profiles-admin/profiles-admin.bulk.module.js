import mongoose from 'mongoose';
import { Configuration, StudentProfile } from '../../../../models/index.js';
import { badRequest } from '../../../../services/base/index.js';
import { asyncHandler, hasConfiguredBatch, sendStandardResponse } from '../../../../utils/index.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

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
  const { degree, department, batch, rollNumbers } = req.body;
  const normalizedRollNumbers = Array.isArray(rollNumbers)
    ? [...new Set(rollNumbers.map((rollNumber) => (
      typeof rollNumber === 'string' ? rollNumber.trim().toUpperCase() : ''
    )).filter(Boolean))]
    : [];

  if (!degree || !department || !batch) {
    return sendStandardResponse(res, badRequest('degree, department, and batch are required'));
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
      const studentBatchesConfig = await Configuration.findOne({ key: 'studentBatches' }).session(session);
      const configuredBatches = studentBatchesConfig?.value || {};

      if (!hasConfiguredBatch(configuredBatches, { degree, department, batch })) {
        responsePayload = badRequest('The selected batch is not configured for the selected degree and department');
        return;
      }

      const existingStudents = await StudentProfile.find({ rollNumber: { $in: normalizedRollNumbers } })
        .select('rollNumber')
        .session(session);
      const existingRollNumbers = existingStudents.map((student) => student.rollNumber);
      const unsuccessfulRollNumbers = normalizedRollNumbers.filter((rollNumber) => !existingRollNumbers.includes(rollNumber));

      const students = await StudentProfile.updateMany(
        { rollNumber: { $in: existingRollNumbers } },
        { $set: { degree, department, batch } },
        { session }
      );

      if (students.matchedCount === 0) {
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

      responsePayload = {
        success: true,
        statusCode: 200,
        data: {
          updatedCount: students.modifiedCount,
          matchedCount: students.matchedCount,
          unsuccessfulRollNumbers,
          assignment: { degree, department, batch },
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
