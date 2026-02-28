import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { StudentProfile, User } from '../../../../models/index.js';
import { success, badRequest, forbidden, notFound } from '../../../../services/base/index.js';
import { asyncHandler, sendStandardResponse } from '../../../../utils/index.js';
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

const normalizeCreateStudent = (student = {}) => {
  const name = typeof student.name === 'string' ? student.name.trim() : '';
  const email = typeof student.email === 'string' ? student.email.trim() : '';
  const rollNumber = typeof student.rollNumber === 'string' ? student.rollNumber.trim().toUpperCase() : '';
  const password = typeof student.password === 'string' ? student.password : '';

  return {
    name,
    email,
    rollNumber,
    password,
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
  department: '',
  degree: '',
  gender: '',
  dateOfBirth: null,
  address: '',
  admissionDate: null,
  guardian: '',
  guardianPhone: '',
  guardianEmail: '',
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

  const userDocs = await Promise.all(
    studentsToCreate.map(async (student) => {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(student.password || student.rollNumber, salt);

      return {
        email: student.email,
        name: student.name,
        role: 'Student',
        phone: '',
        profileImage: '',
        password: hashedPassword,
      };
    })
  );

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
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const constraintContext = getConstraintContext(currentUser);
    const studentsArray = Array.isArray(studentsData) ? studentsData : [studentsData];
    if (studentsArray.length > MAX_BULK_RECORDS) {
      await session.abortTransaction();
      return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} students are allowed per request`));
    }
    const errors = [];
    const results = [];

    const rollNumbers = [];
    for (const student of studentsArray) {
      if (!student.rollNumber) {
        errors.push({
          student: student.email || student.rollNumber || 'Unknown',
          message: 'Missing required field: rollNumber',
        });
      } else {
        rollNumbers.push(student.rollNumber.toUpperCase());
      }
    }

    if (rollNumbers.length === 0) {
      await session.abortTransaction();
      return sendStandardResponse(res, badRequest('No valid rollNumber provided'));
    }

    const existingProfiles = await StudentProfile.find({ rollNumber: { $in: rollNumbers } })
      .populate('userId')
      .session(session);

    const existingProfileUserIds = existingProfiles.map((profile) => profile.userId?._id).filter(Boolean);
    const existingProfileDetails = await StudentProfile.getFullStudentData(existingProfileUserIds);
    const profileDetailsByRollNumber = new Map();
    for (const profile of existingProfileDetails) {
      if (profile?.rollNumber) {
        profileDetailsByRollNumber.set(profile.rollNumber.toUpperCase(), profile);
      }
    }

    const profileMap = {};
    existingProfiles.forEach((profile) => {
      profileMap[profile.rollNumber] = profile;
    });

    const userBulkOps = [];
    const profileBulkOps = [];

    for (const student of studentsArray) {
      const roll = student.rollNumber;
      if (!roll) continue;

      const existingProfile = profileMap[roll.toUpperCase()];
      if (!existingProfile) {
        errors.push({ student: roll, message: `Student with roll number ${roll} not found` });
        continue;
      }

      const currentProfile = profileDetailsByRollNumber.get(roll.toUpperCase());
      if (!isHostelAllowed(currentProfile?.hostelId, constraintContext)) {
        errors.push({
          student: roll,
          message: 'Not allowed to modify this student due to hostel scope',
        });
        continue;
      }

      const userUpdate = {};
      if (student.name) userUpdate.name = student.name;
      if (student.email) userUpdate.email = student.email ? student.email.trim() : student.email;
      if (student.password) userUpdate.password = await bcrypt.hash(student.password, 10);
      if (student.phone !== undefined) userUpdate.phone = student.phone || '';
      if (student.profileImage !== undefined) userUpdate.profileImage = student.profileImage || '';

      if (Object.keys(userUpdate).length > 0) {
        userBulkOps.push({
          updateOne: {
            filter: { _id: existingProfile.userId._id },
            update: { $set: userUpdate },
          },
        });
      }

      const profileUpdate = {};
      if (student.gender !== undefined) profileUpdate.gender = student.gender;
      if (student.dateOfBirth !== undefined) profileUpdate.dateOfBirth = formatDate(student.dateOfBirth);
      if (student.department !== undefined) profileUpdate.department = student.department;
      if (student.degree !== undefined) profileUpdate.degree = student.degree;
      if (student.address !== undefined) profileUpdate.address = student.address;
      if (student.admissionDate !== undefined) profileUpdate.admissionDate = formatDate(student.admissionDate);
      if (student.guardian !== undefined) profileUpdate.guardian = student.guardian;
      if (student.guardianPhone !== undefined) profileUpdate.guardianPhone = student.guardianPhone;
      if (student.guardianEmail !== undefined) profileUpdate.guardianEmail = student.guardianEmail;

      if (Object.keys(profileUpdate).length > 0 && currentUser?._id) {
        profileUpdate.lastUpdatedBy = currentUser._id;
        profileBulkOps.push({
          updateOne: {
            filter: { _id: existingProfile._id },
            update: { $set: profileUpdate },
          },
        });
      }

      results.push({
        rollNumber: roll,
        userId: existingProfile.userId._id,
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

    if (userBulkOps.length === 0 && profileBulkOps.length === 0) {
      await session.abortTransaction();
      return sendStandardResponse(res, success({
        results,
        errors,
      }, 200, 'No updates were needed for the provided data'));
    }

    await session.commitTransaction();

    const isMultipleStudents = Array.isArray(studentsData);
    const responseStatus = errors.length > 0 ? 207 : 200;

    return sendStandardResponse(res, {
      success: true,
      statusCode: responseStatus,
      data: {
        results: isMultipleStudents ? results : (results[0] || null),
        errors,
      },
      message: isMultipleStudents
        ? `Updated ${results.length} out of ${studentsArray.length} student profiles`
        : 'Student profile updated successfully',
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
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
    admissionDate,
    guardian,
    guardianPhone,
    guardianEmail,
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
  };

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
