import mongoose from 'mongoose';
import { Configuration, StudentProfile, User } from '../../../../models/index.js';
import { success, badRequest, forbidden, notFound } from '../../../../services/base/index.js';
import { asyncHandler, hasConfiguredBatch, sendStandardResponse } from '../../../../utils/index.js';
import { formatDate } from '../../../../utils/utils.js';
import { getIO } from '../../../../loaders/socket.loader.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';
import {
  toObjectIdString,
  getConstraintContext,
  isHostelAllowed,
  buildEmptyStudentsResult,
} from './profiles-admin.shared.js';

const STUDENT_IMPORT_PROGRESS_EVENT = 'students:import:progress';
const CREATE_STUDENTS_CHUNK_SIZE = 200;
const STUDENT_UPDATE_PROGRESS_EVENT = 'students:update:progress';
const UPDATE_STUDENTS_CHUNK_SIZE = 200;

const emitStudentImportProgress = ({
  userId,
  jobId = null,
  phase,
  total = 0,
  processed = 0,
  created = 0,
  failed = 0,
  chunkIndex = null,
  chunkCount = null,
  message = null,
}) => {
  if (!userId || !phase) return;

  try {
    const io = getIO();
    io.to(`user:${userId}`).emit(STUDENT_IMPORT_PROGRESS_EVENT, {
      jobId,
      phase,
      total,
      processed,
      created,
      failed,
      chunkIndex,
      chunkCount,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Avoid failing HTTP flow if socket layer is unavailable.
  }
};

const emitStudentUpdateProgress = ({
  userId,
  jobId = null,
  phase,
  total = 0,
  processed = 0,
  updated = 0,
  failed = 0,
  chunkIndex = null,
  chunkCount = null,
  message = null,
}) => {
  if (!userId || !phase) return;

  try {
    const io = getIO();
    io.to(`user:${userId}`).emit(STUDENT_UPDATE_PROGRESS_EVENT, {
      jobId,
      phase,
      total,
      processed,
      updated,
      failed,
      chunkIndex,
      chunkCount,
      message,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Avoid failing HTTP flow if socket layer is unavailable.
  }
};

const normalizeCreateStudent = (student = {}) => {
  const name = typeof student.name === 'string' ? student.name.trim() : '';
  const email = typeof student.email === 'string' ? student.email.trim() : '';
  const rollNumber = typeof student.rollNumber === 'string' ? student.rollNumber.trim().toUpperCase() : '';

  return {
    name,
    email,
    rollNumber,
  };
};

const splitIntoChunks = (items, chunkSize) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const buildCreateProfileDoc = (userId, rollNumber) => ({
  userId,
  rollNumber,
  status: 'Active',
});

const validateCreateStudents = (students) => {
  const validStudents = [];
  const validationErrors = [];
  const seenEmails = new Set();
  const seenRollNumbers = new Set();

  students.forEach((rawStudent) => {
    const student = normalizeCreateStudent(rawStudent);
    const { name, email, rollNumber } = student;

    if (!name || !email || !rollNumber) {
      validationErrors.push({
        student: rollNumber || email || 'Unknown',
        message: 'Missing required fields: email, name, rollNumber',
      });
      return;
    }

    if (seenEmails.has(email)) {
      validationErrors.push({
        student: rollNumber || email,
        message: `Duplicate email ${email} in import file`,
      });
      return;
    }

    if (seenRollNumbers.has(rollNumber)) {
      validationErrors.push({
        student: rollNumber || email,
        message: `Duplicate roll number ${rollNumber} in import file`,
      });
      return;
    }

    seenEmails.add(email);
    seenRollNumbers.add(rollNumber);
    validStudents.push(student);
  });

  return { validStudents, validationErrors };
};

const processCreateStudentsChunk = async (chunkStudents, session, allErrors) => {
  const emails = chunkStudents.map((student) => student.email);
  const rollNumbers = chunkStudents.map((student) => student.rollNumber);

  const [existingUsers, existingProfiles] = await Promise.all([
    User.find({ email: { $in: emails } }).session(session),
    StudentProfile.find({ rollNumber: { $in: rollNumbers } }).session(session),
  ]);

  const existingEmails = new Set(existingUsers.map((user) => user.email));
  const existingRollNumbers = new Set(existingProfiles.map((profile) => profile.rollNumber));

  const studentsToCreate = [];
  chunkStudents.forEach((student) => {
    if (existingEmails.has(student.email)) {
      allErrors.push({
        student: student.rollNumber || student.email,
        message: `Email ${student.email} already exists`,
      });
      return;
    }

    if (existingRollNumbers.has(student.rollNumber)) {
      allErrors.push({
        student: student.rollNumber || student.email,
        message: `Roll number ${student.rollNumber} already exists`,
      });
      return;
    }

    studentsToCreate.push(student);
  });

  if (studentsToCreate.length === 0) {
    return [];
  }

  const userDocs = studentsToCreate.map((student) => ({
    email: student.email,
    name: student.name,
    role: 'Student',
  }));

  const userInsertResult = await User.collection.insertMany(userDocs, { session });
  const insertedUserIds = Object.values(userInsertResult.insertedIds);

  const profileDocs = insertedUserIds.map((userId, index) => (
    buildCreateProfileDoc(userId, studentsToCreate[index].rollNumber)
  ));

  const profileInsertResult = await StudentProfile.collection.insertMany(profileDocs, { session });

  return insertedUserIds.map((userId, index) => ({
    user: { _id: userId },
    profile: {
      _id: profileInsertResult.insertedIds[index],
      rollNumber: studentsToCreate[index].rollNumber,
    },
  }));
};

const normalizeUpdateRollNumber = (rollNumber) => (
  typeof rollNumber === 'string' ? rollNumber.trim().toUpperCase() : ''
);

const buildUserUpdatePayload = (student) => {
  const userUpdate = {};

  if (student.name) userUpdate.name = student.name;
  if (student.email) userUpdate.email = student.email.trim();
  if (student.phone !== undefined) userUpdate.phone = student.phone || '';
  if (student.profileImage !== undefined) userUpdate.profileImage = student.profileImage || '';

  return userUpdate;
};

const resolveBatchUpdate = ({ student = {}, currentProfile = {}, studentBatchesConfig = {} }) => {
  const hasDegreeChange = student.degree !== undefined;
  const hasDepartmentChange = student.department !== undefined;
  const hasBatchChange = student.batch !== undefined;

  if (!hasDegreeChange && !hasDepartmentChange && !hasBatchChange) {
    return { success: true, value: undefined };
  }

  const nextDegree = hasDegreeChange ? (student.degree || '') : (currentProfile.degree || '');
  const nextDepartment = hasDepartmentChange ? (student.department || '') : (currentProfile.department || '');

  if (hasBatchChange) {
    const nextBatch = typeof student.batch === 'string' ? student.batch.trim() : '';

    if (!nextBatch) {
      return { success: true, value: '' };
    }

    if (!nextDegree || !nextDepartment) {
      return {
        success: false,
        message: 'Degree and department are required before assigning a batch',
      };
    }

    if (!hasConfiguredBatch(studentBatchesConfig, { degree: nextDegree, department: nextDepartment, batch: nextBatch })) {
      return {
        success: false,
        message: `Batch "${nextBatch}" is not configured for ${nextDegree} / ${nextDepartment}`,
      };
    }

    return { success: true, value: nextBatch };
  }

  if (hasDegreeChange || hasDepartmentChange) {
    return { success: true, value: '' };
  }

  return { success: true, value: undefined };
};

const buildProfileUpdatePayload = (student, currentUserId, batchValue) => {
  const profileUpdate = {};

  if (student.gender !== undefined) profileUpdate.gender = student.gender;
  if (student.dateOfBirth !== undefined) profileUpdate.dateOfBirth = formatDate(student.dateOfBirth);
  if (student.department !== undefined) profileUpdate.department = student.department;
  if (student.degree !== undefined) profileUpdate.degree = student.degree;
  if (batchValue !== undefined) profileUpdate.batch = batchValue;
  if (student.address !== undefined) profileUpdate.address = student.address;
  if (student.admissionDate !== undefined) profileUpdate.admissionDate = formatDate(student.admissionDate);
  if (student.guardian !== undefined) profileUpdate.guardian = student.guardian;
  if (student.guardianPhone !== undefined) profileUpdate.guardianPhone = student.guardianPhone;
  if (student.guardianEmail !== undefined) profileUpdate.guardianEmail = student.guardianEmail;
  if (student.alumniEmailId !== undefined) profileUpdate.alumniEmailId = student.alumniEmailId;

  if (Object.keys(profileUpdate).length > 0 && currentUserId) {
    profileUpdate.lastUpdatedBy = currentUserId;
  }

  return profileUpdate;
};

const processUpdateStudentsChunk = async ({
  chunkStudents,
  session,
  currentUserId,
  errors,
}) => {
  const results = [];
  const rollNumbers = [];

  for (const student of chunkStudents) {
    const rollNumber = normalizeUpdateRollNumber(student.rollNumber);
    if (!rollNumber) {
      errors.push({
        student: student.email || student.rollNumber || 'Unknown',
        message: 'Missing required field: rollNumber',
      });
      continue;
    }

    rollNumbers.push(rollNumber);
  }

  if (rollNumbers.length === 0) {
    return { results, userOpsCount: 0, profileOpsCount: 0 };
  }

  const existingProfiles = await StudentProfile.find({ rollNumber: { $in: rollNumbers } })
    .select('_id rollNumber userId degree department batch')
    .session(session)
    .lean();

  const studentBatchesConfig = chunkStudents.some((student) => student.batch !== undefined)
    ? ((await Configuration.findOne({ key: 'studentBatches' }).session(session))?.value || {})
    : {};

  const profileByRollNumber = new Map();
  existingProfiles.forEach((profile) => {
    profileByRollNumber.set(profile.rollNumber.toUpperCase(), profile);
  });

  const userBulkOps = [];
  const profileBulkOps = [];

  for (let index = 0; index < chunkStudents.length; index += 1) {
    const student = chunkStudents[index];
    const rollNumber = normalizeUpdateRollNumber(student.rollNumber);
    if (!rollNumber) continue;

    const existingProfile = profileByRollNumber.get(rollNumber);
    if (!existingProfile) {
      errors.push({
        student: rollNumber,
        message: `Student with roll number ${rollNumber} not found`,
      });
      continue;
    }

    const userId = existingProfile.userId;
    if (!userId) {
      errors.push({
        student: rollNumber,
        message: `Student user mapping not found for roll number ${rollNumber}`,
      });
      continue;
    }

    const userUpdate = buildUserUpdatePayload(student);
    if (Object.keys(userUpdate).length > 0) {
      userBulkOps.push({
        updateOne: {
          filter: { _id: userId },
          update: { $set: userUpdate },
        },
      });
    }

    const batchResolution = resolveBatchUpdate({
      student,
      currentProfile: existingProfile,
      studentBatchesConfig,
    });
    if (!batchResolution.success) {
      errors.push({
        student: rollNumber,
        message: batchResolution.message,
      });
      continue;
    }

    const profileUpdate = buildProfileUpdatePayload(student, currentUserId, batchResolution.value);
    if (Object.keys(profileUpdate).length > 0 && currentUserId) {
      profileBulkOps.push({
        updateOne: {
          filter: { _id: existingProfile._id },
          update: { $set: profileUpdate },
        },
      });
    }

    results.push({
      rollNumber,
      userId,
      updated: {
        user: Object.keys(userUpdate).length > 0,
        profile: Object.keys(profileUpdate).length > 0,
      },
    });
  }

  if (userBulkOps.length > 0) {
    await User.bulkWrite(userBulkOps, { session });
  }
  if (profileBulkOps.length > 0) {
    await StudentProfile.bulkWrite(profileBulkOps, { session });
  }

  return {
    results,
    userOpsCount: userBulkOps.length,
    profileOpsCount: profileBulkOps.length,
  };
};

export const createStudentsProfiles = asyncHandler(async (req, res) => {
  const studentsData = req.body;
  const studentsArray = Array.isArray(studentsData) ? studentsData : [studentsData];
  const importJobIdHeader = req.headers['x-import-job-id'];
  const importJobId = typeof importJobIdHeader === 'string' && importJobIdHeader.trim()
    ? importJobIdHeader.trim()
    : null;
  const importUserId = req.user?._id?.toString();
  const progress = {
    total: studentsArray.length,
    processed: 0,
    created: 0,
    failed: 0,
  };

  if (studentsArray.length === 0) {
    return sendStandardResponse(res, badRequest('No student data provided'));
  }
  if (studentsArray.length > MAX_BULK_RECORDS) {
    return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} students are allowed per request`));
  }

  const results = [];
  const errors = [];

  emitStudentImportProgress({
    userId: importUserId,
    jobId: importJobId,
    phase: 'started',
    ...progress,
    message: 'Student import started',
  });

  try {
    const { validStudents, validationErrors } = validateCreateStudents(studentsArray);
    errors.push(...validationErrors);

    progress.processed += validationErrors.length;
    progress.failed += validationErrors.length;

    const studentChunks = splitIntoChunks(validStudents, CREATE_STUDENTS_CHUNK_SIZE);

    for (let chunkIndex = 0; chunkIndex < studentChunks.length; chunkIndex += 1) {
      const chunkStudents = studentChunks[chunkIndex];
      const session = await mongoose.startSession();

      let chunkResults = [];
      try {
        await session.withTransaction(async () => {
          chunkResults = await processCreateStudentsChunk(chunkStudents, session, errors);
        });
      } finally {
        await session.endSession();
      }

      results.push(...chunkResults);
      progress.processed += chunkStudents.length;
      progress.created += chunkResults.length;
      progress.failed += chunkStudents.length - chunkResults.length;

      emitStudentImportProgress({
        userId: importUserId,
        jobId: importJobId,
        phase: 'processing',
        ...progress,
        chunkIndex: chunkIndex + 1,
        chunkCount: studentChunks.length,
        message: `Processed chunk ${chunkIndex + 1} of ${studentChunks.length}`,
      });
    }

    const isMultipleStudents = Array.isArray(studentsData);
    const responseStatus = errors.length > 0 ? 207 : 201;
    const responseMessage = isMultipleStudents
      ? `Created ${results.length} out of ${studentsArray.length} student profiles`
      : 'Student profile created successfully';

    emitStudentImportProgress({
      userId: importUserId,
      jobId: importJobId,
      phase: 'completed',
      ...progress,
      message: responseMessage,
    });

    return sendStandardResponse(res, {
      success: true,
      statusCode: responseStatus,
      data: {
        results: isMultipleStudents ? results : (results[0] || null),
        errors: errors.length > 0 ? errors : [],
      },
      message: responseMessage,
    });
  } catch (error) {
    emitStudentImportProgress({
      userId: importUserId,
      jobId: importJobId,
      phase: 'failed',
      ...progress,
      message: error?.message || 'Student import failed',
    });
    throw error;
  }
});

export const updateStudentsProfiles = asyncHandler(async (req, res) => {
  const studentsData = req.body;
  const currentUser = req.user;
  const studentsArray = Array.isArray(studentsData) ? studentsData : [studentsData];
  const updateJobIdHeader = req.headers['x-update-job-id'];
  const importJobIdHeader = req.headers['x-import-job-id'];
  const updateJobIdRaw = typeof updateJobIdHeader === 'string' && updateJobIdHeader.trim()
    ? updateJobIdHeader
    : importJobIdHeader;
  const updateJobId = typeof updateJobIdRaw === 'string' && updateJobIdRaw.trim()
    ? updateJobIdRaw.trim()
    : null;
  const updateUserId = currentUser?._id?.toString();
  const progress = {
    total: studentsArray.length,
    processed: 0,
    updated: 0,
    failed: 0,
  };

  if (studentsArray.length === 0) {
    return sendStandardResponse(res, badRequest('No student data provided'));
  }
  if (studentsArray.length > MAX_BULK_RECORDS) {
    return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} students are allowed per request`));
  }

  const errors = [];
  const results = [];
  let totalUserOps = 0;
  let totalProfileOps = 0;

  emitStudentUpdateProgress({
    userId: updateUserId,
    jobId: updateJobId,
    phase: 'started',
    ...progress,
    message: 'Student update started',
  });

  try {
    const studentChunks = splitIntoChunks(studentsArray, UPDATE_STUDENTS_CHUNK_SIZE);

    for (let chunkIndex = 0; chunkIndex < studentChunks.length; chunkIndex += 1) {
      const chunkStudents = studentChunks[chunkIndex];
      const session = await mongoose.startSession();

      let chunkResult = { results: [], userOpsCount: 0, profileOpsCount: 0 };
      try {
        await session.withTransaction(async () => {
          chunkResult = await processUpdateStudentsChunk({
            chunkStudents,
            session,
            currentUserId: currentUser?._id || null,
            errors,
          });
        });
      } finally {
        await session.endSession();
      }

      results.push(...chunkResult.results);
      totalUserOps += chunkResult.userOpsCount;
      totalProfileOps += chunkResult.profileOpsCount;

      progress.processed += chunkStudents.length;
      progress.updated += chunkResult.results.length;
      progress.failed = errors.length;

      emitStudentUpdateProgress({
        userId: updateUserId,
        jobId: updateJobId,
        phase: 'processing',
        ...progress,
        chunkIndex: chunkIndex + 1,
        chunkCount: studentChunks.length,
        message: `Processed chunk ${chunkIndex + 1} of ${studentChunks.length}`,
      });
    }

    if (totalUserOps === 0 && totalProfileOps === 0) {
      emitStudentUpdateProgress({
        userId: updateUserId,
        jobId: updateJobId,
        phase: 'completed',
        ...progress,
        message: 'No updates were needed for the provided data',
      });

      return sendStandardResponse(res, success({
        results,
        errors,
      }, 200, 'No updates were needed for the provided data'));
    }

    const isMultipleStudents = Array.isArray(studentsData);
    const responseStatus = errors.length > 0 ? 207 : 200;
    const responseMessage = isMultipleStudents
      ? `Updated ${results.length} out of ${studentsArray.length} student profiles`
      : 'Student profile updated successfully';

    emitStudentUpdateProgress({
      userId: updateUserId,
      jobId: updateJobId,
      phase: 'completed',
      ...progress,
      message: responseMessage,
    });

    return sendStandardResponse(res, {
      success: true,
      statusCode: responseStatus,
      data: {
        results: isMultipleStudents ? results : (results[0] || null),
        errors,
      },
      message: responseMessage,
    });
  } catch (error) {
    emitStudentUpdateProgress({
      userId: updateUserId,
      jobId: updateJobId,
      phase: 'failed',
      ...progress,
      message: error?.message || 'Student update failed',
    });
    throw error;
  }
});

export const getStudents = asyncHandler(async (req, res) => {
  const searchQuery = { ...req.query };
  const constraintContext = getConstraintContext(req.user);
  const requestedHostelId = toObjectIdString(searchQuery.hostelId);

  if (constraintContext.scopedHostelIds && constraintContext.scopedHostelIds.size === 0) {
    return sendStandardResponse(res, buildEmptyStudentsResult(searchQuery));
  }

  if (constraintContext.scopedHostelIds) {
    if (requestedHostelId) {
      if (!constraintContext.scopedHostelIds.has(requestedHostelId)) {
        return sendStandardResponse(res, buildEmptyStudentsResult(searchQuery));
      }
      searchQuery.hostelId = requestedHostelId;
    } else {
      const allowedHostelIds = [...constraintContext.scopedHostelIds];
      if (allowedHostelIds.length === 1) {
        searchQuery.hostelId = allowedHostelIds[0];
      } else {
        searchQuery.hostelIds = allowedHostelIds;
        delete searchQuery.hostelId;
      }
    }
  } else if (req.user.hostel) {
    searchQuery.hostelId = req.user.hostel._id.toString();
  }

  const studentProfilesResult = await StudentProfile.searchStudents(searchQuery);
  const studentProfiles = studentProfilesResult[0].data;
  const totalCount = studentProfilesResult[0].totalCount[0]?.count || 0;
  const missingOptions = StudentProfile.getMissingFieldOptions();

  return sendStandardResponse(res, {
    success: true,
    statusCode: 200,
    data: {
      students: studentProfiles,
      pagination: {
        total: totalCount,
        page: parseInt(searchQuery.page, 10) || 1,
        limit: parseInt(searchQuery.limit, 10) || 10,
        pages: Math.ceil(totalCount / (parseInt(searchQuery.limit, 10) || 10)),
      },
      meta: { missingOptions },
    },
    message: 'Students fetched successfully',
  });
});

export const getStudentDetails = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  const constraintContext = getConstraintContext(req.user);
  const studentProfile = await StudentProfile.getFullStudentData(userId);

  if (!studentProfile) {
    return sendStandardResponse(res, notFound('Student profile not found'));
  }

  if (!isHostelAllowed(studentProfile.hostelId, constraintContext)) {
    return sendStandardResponse(res, forbidden('You are not allowed to view this student profile'));
  }

  return sendStandardResponse(res, success({ student: studentProfile }));
});

export const getMultipleStudentDetails = asyncHandler(async (req, res) => {
  const userIds = req.body.userIds;
  const constraintContext = getConstraintContext(req.user);

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return sendStandardResponse(res, badRequest('Please provide an array of user IDs'));
  }

  if (userIds.length > 5000) {
    return sendStandardResponse(res, badRequest('Maximum of 5000 student profiles can be fetched at once'));
  }

  const studentsData = await StudentProfile.getFullStudentData(userIds);

  if (studentsData.length === 0) {
    return sendStandardResponse(res, notFound('No student profiles found'));
  }

  const filteredStudentsData = constraintContext.scopedHostelIds
    ? studentsData.filter((student) => isHostelAllowed(student.hostelId, constraintContext))
    : studentsData;

  const foundUserIds = filteredStudentsData.map((student) => student.userId.toString());
  const missingUserIds = userIds.filter((id) => !foundUserIds.includes(id));

  const errors = missingUserIds.map((id) => ({
    userId: id,
    message: 'Student profile not found or not allowed by hostel scope',
  }));

  const responseStatus = errors.length > 0 ? 207 : 200;

  return sendStandardResponse(res, {
    success: true,
    statusCode: responseStatus,
    data: {
      students: filteredStudentsData,
      errors,
    },
    message: `Retrieved ${filteredStudentsData.length} out of ${userIds.length} student profiles`,
  });
});

export const getStudentId = asyncHandler(async (req, res) => {
  const student = await StudentProfile.findOne({ userId: req.params.userId });
  return sendStandardResponse(res, success({ studentId: student?._id?.toString() || null }));
});

export const updateStudentProfile = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  const updateData = req.body;
  const currentUser = req.user;
  const constraintContext = getConstraintContext(currentUser);
  const {
    name,
    email,
    rollNumber,
    phone,
    gender,
    dateOfBirth,
    address,
    department,
    degree,
    batch,
    admissionDate,
    guardian,
    guardianPhone,
    guardianEmail,
    alumniEmailId,
    profileImage,
  } = updateData;

  const trimmedEmail = email ? email.trim() : email;
  const currentProfile = await StudentProfile.getFullStudentData(userId);

  if (!currentProfile) {
    return sendStandardResponse(res, notFound('Student profile not found or update failed'));
  }

  if (!isHostelAllowed(currentProfile.hostelId, constraintContext)) {
    return sendStandardResponse(res, forbidden('You are not allowed to update this student profile'));
  }

  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { name, email: trimmedEmail, phone, profileImage },
    { new: true }
  );

  if (!updatedUser) {
    return sendStandardResponse(res, notFound('User not found or update failed'));
  }

  const profileUpdateData = {
    rollNumber,
    gender,
    dateOfBirth,
    address,
    department,
    degree,
    admissionDate,
    guardian,
    guardianPhone,
    guardianEmail,
    alumniEmailId,
  };

  const studentBatchesConfig = batch !== undefined
    ? ((await Configuration.findOne({ key: 'studentBatches' }))?.value || {})
    : {};
  const batchResolution = resolveBatchUpdate({
    student: { degree, department, batch },
    currentProfile,
    studentBatchesConfig,
  });
  if (!batchResolution.success) {
    return sendStandardResponse(res, badRequest(batchResolution.message));
  }
  if (batchResolution.value !== undefined) {
    profileUpdateData.batch = batchResolution.value;
  }

  const updatedProfile = await StudentProfile.findOneAndUpdate(
    { userId },
    { $set: profileUpdateData },
    { new: true }
  );

  if (!updatedProfile) {
    return sendStandardResponse(res, notFound('Student profile not found or update failed'));
  }

  return sendStandardResponse(res, success(null, 200, 'Student profile updated successfully'));
});

export const profilesAdminProfilesModule = {
  createStudentsProfiles,
  updateStudentsProfiles,
  getStudents,
  getStudentDetails,
  getMultipleStudentDetails,
  getStudentId,
  updateStudentProfile,
};

export default profilesAdminProfilesModule;
