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
  if (Object.keys(data).length > MAX_BULK_RECORDS) {
    return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`));
  }

  const results = [];
  const errors = [];
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const rollNumbers = Object.keys(data);
    const students = await StudentProfile.find({ rollNumber: { $in: rollNumbers } }).session(session);

    const studentMap = new Map();
    students.forEach((student) => {
      studentMap.set(student.rollNumber, student);
    });

    const studentsToSave = [];

    for (const [rollNumber, studentData] of Object.entries(data)) {
      const student = studentMap.get(rollNumber);

      if (!student) {
        errors.push({ rollNumber, error: 'Student not found' });
        continue;
      }

      const { isDayScholar, dayScholarDetails } = studentData;

      if (isDayScholar) {
        const isIncomplete = !dayScholarDetails
          || !dayScholarDetails.address
          || !dayScholarDetails.ownerName
          || !dayScholarDetails.ownerPhone
          || !dayScholarDetails.ownerEmail;

        if (isIncomplete) {
          errors.push({ rollNumber, error: 'Incomplete day scholar details' });
          continue;
        }

        student.isDayScholar = true;
        student.dayScholarDetails = dayScholarDetails;
      } else {
        student.isDayScholar = false;
        student.dayScholarDetails = null;
      }

      studentsToSave.push(student);
      results.push({ rollNumber, success: true, isDayScholar: student.isDayScholar });
    }

    if (studentsToSave.length > 0) {
      await Promise.all(studentsToSave.map((student) => student.save({ session })));
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
