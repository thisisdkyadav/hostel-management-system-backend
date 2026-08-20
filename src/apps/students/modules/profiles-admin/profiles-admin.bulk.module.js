import mongoose from 'mongoose';
import { studentProfileOwner } from '../../../../services/student/studentProfileOwner.service.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { configQueries } from '../../../../services/config/configQueries.service.js';
import { roomOwner } from '../../../../services/hostel/roomOwner.service.js';
import { badRequest } from '../../../../services/base/index.js';
import {
  asyncHandler,
  buildBatchScopeStudentMatch,
  hasConfiguredBatch,
  MIXED_BATCH_SCOPE_KEY,
  sendStandardResponse,
} from '../../../../utils/index.js';
import { toDateOnly } from '../../../../utils/utils.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';
import {
  findProfileIdsInScope,
  findProfilesInScope,
  findStudentsByRollNumbersInScope,
  getHostelScope,
  isHostelAllowed,
  isHostelScoped,
} from '../../../../utils/hostelScope.js';

const BATCH_ASSIGNMENT_MODE_APPEND = 'append';
const BATCH_ASSIGNMENT_MODE_REPLACE = 'replace';
const GROUP_ASSIGNMENT_MODE_ADD = 'add';
const GROUP_ASSIGNMENT_MODE_REMOVE = 'remove';
const GROUP_ASSIGNMENT_MODE_REPLACE = 'replace';
const STUDENT_STATUS_ACTIVE = 'Active';
const VALID_STUDENT_STATUSES = new Set([STUDENT_STATUS_ACTIVE, 'Graduated', 'Dropped', 'Inactive']);

const asTrimmedString = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const normalizeRollNumber = (value) => asTrimmedString(value).toUpperCase();

const normalizeEmail = (value) => asTrimmedString(value).toLowerCase();

const normalizePhone = (value) => asTrimmedString(value).replace(/\D/g, '');

const normalizeComparableText = (value) => asTrimmedString(value).replace(/\s+/g, ' ').toLowerCase();

const COMPARABLE_FIELDS = [
  'name',
  'email',
  'secondaryEmail',
  'facultyAdvisorEmail',
  'phone',
  'profileImage',
  'gender',
  'dateOfBirth',
  'degree',
  'department',
  'year',
  'address',
  'admissionDate',
  'guardian',
  'guardianPhone',
  'guardianEmail',
];

const EMAIL_FIELDS = new Set(['email', 'secondaryEmail', 'facultyAdvisorEmail', 'guardianEmail']);
const PHONE_FIELDS = new Set(['phone', 'guardianPhone']);
const DATE_FIELDS = new Set(['dateOfBirth', 'admissionDate']);
const TEXT_FIELDS = new Set(['name', 'gender', 'degree', 'department', 'address', 'guardian']);

const computeYear = (admissionDate) => {
  if (!admissionDate) return '';
  const currentDate = new Date();
  const admissionYear = Number(String(admissionDate).slice(0, 4));
  if (!Number.isFinite(admissionYear)) return '';
  const isNext = currentDate.getMonth() > 5 ? 1 : 0;
  return String(currentDate.getFullYear() - admissionYear + isNext || '');
};

const allocationHostelId = (student) => student?.currentRoomAllocation?.hostelId ?? null;

const CONSISTENCY_POPULATE = [
  { path: 'userId', select: 'name email phone profileImage' },
  { path: 'currentRoomAllocation', select: 'hostelId' },
];

const toComparableStudent = (profile) => {
  const user = profile?.userId && typeof profile.userId === 'object' ? profile.userId : {};
  const admissionDate = toDateOnly(profile?.admissionDate) || '';

  return {
    rollNumber: normalizeRollNumber(profile?.rollNumber),
    name: asTrimmedString(user.name),
    email: normalizeEmail(user.email),
    phone: asTrimmedString(user.phone),
    profileImage: asTrimmedString(user.profileImage),
    gender: asTrimmedString(profile?.gender),
    dateOfBirth: toDateOnly(profile?.dateOfBirth) || '',
    degree: asTrimmedString(profile?.degree),
    department: asTrimmedString(profile?.department),
    year: computeYear(admissionDate),
    address: asTrimmedString(profile?.address),
    admissionDate,
    guardian: asTrimmedString(profile?.guardian),
    guardianPhone: asTrimmedString(profile?.guardianPhone),
    guardianEmail: normalizeEmail(profile?.guardianEmail),
    secondaryEmail: normalizeEmail(profile?.secondaryEmail),
    facultyAdvisorEmail: normalizeEmail(profile?.facultyAdvisorEmail),
  };
};

const normalizeCsvField = (field, value) => {
  if (field === 'rollNumber') return normalizeRollNumber(value);
  if (EMAIL_FIELDS.has(field)) return normalizeEmail(value);
  if (PHONE_FIELDS.has(field)) return normalizePhone(value);
  if (DATE_FIELDS.has(field)) return toDateOnly(value) || asTrimmedString(value);
  if (field === 'year') return asTrimmedString(value);
  return asTrimmedString(value);
};

const fieldValuesMatch = (field, csvValue, systemValue) => {
  if (EMAIL_FIELDS.has(field) || field === 'rollNumber') {
    return csvValue === systemValue;
  }
  if (PHONE_FIELDS.has(field)) {
    return normalizePhone(csvValue) === normalizePhone(systemValue);
  }
  if (TEXT_FIELDS.has(field)) {
    return normalizeComparableText(csvValue) === normalizeComparableText(systemValue);
  }
  if (field === 'year') {
    const csvYear = Number(csvValue);
    const systemYear = Number(systemValue);
    if (Number.isFinite(csvYear) && Number.isFinite(systemYear)) {
      return csvYear === systemYear;
    }
    return String(csvValue) === String(systemValue);
  }
  return asTrimmedString(csvValue) === asTrimmedString(systemValue);
};

const collectFieldMismatches = (csvRow, systemStudent, fields) => {
  const mismatches = [];

  fields.forEach((field) => {
    const rawValue = csvRow[field];
    if (rawValue === undefined || rawValue === null || asTrimmedString(rawValue) === '') return;

    const csvValue = normalizeCsvField(field, rawValue);
    const systemValue = systemStudent[field] ?? '';
    if (!fieldValuesMatch(field, csvValue, systemValue)) {
      mismatches.push({ field, csvValue, systemValue: systemValue || '' });
    }
  });

  return mismatches;
};

const filterStudentsInScope = (students, scope) => {
  if (!isHostelScoped(scope)) return students;
  return students.filter((student) => isHostelAllowed(allocationHostelId(student), scope));
};

const isNumericRollNumber = (value = '') => /^\d+$/.test(value);

const resolveBatchAssignmentRollNumbers = async ({ session, rollNumbers, rollNumberRange, scope }) => {
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

  // Expanded within the caller's hostel, so the record cap is measured against
  // what they can actually touch rather than the whole institute.
  const numericStudents = isHostelScoped(scope)
    ? await findProfilesInScope({ rollNumber: /^\d+$/ }, scope, { select: 'rollNumber', session })
    : await studentProfileQueries.findNumericRollNumbers({ session });

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
  // Owned by roomOwner: native delete + occupancy recompute in the caller's txn.
  return roomOwner.deallocateStudents({ studentProfileIds }, session);
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

  const scope = getHostelScope(req.user);
  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const existingStudents = await findStudentsByRollNumbersInScope(normalizedRollNumbers, scope, { select: '_id rollNumber', session, lean: true });
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

      const students = await studentProfileOwner.updateMany(
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

  const scope = getHostelScope(req.user);
  const existingStudents = await findStudentsByRollNumbersInScope(normalizedRollNumbers, scope, { select: 'rollNumber degree department batch groups status', lean: true });

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
  // The unfiltered check reads over whatever the caller can see, which for
  // hostel-bound staff is their own hostel rather than the whole system.
  let scopeLabel = isHostelScoped(scope) ? 'Your hostel' : 'System';

  if (scopeType === 'group') {
    const groupName = typeof req.body?.groupName === 'string' ? req.body.groupName.trim() : '';
    if (!groupName) {
      return sendStandardResponse(res, badRequest('groupName is required when checking against a group'));
    }

    const studentGroupsConfig = await configQueries.findByKeyLean('studentGroups');
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

    const studentBatchesConfig = await configQueries.findByKeyLean('studentBatches');
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

export const checkStudentDataConsistency = asyncHandler(async (req, res) => {
  const submitted = Array.isArray(req.body?.students) ? req.body.students : [];

  const rows = submitted
    .map((item, index) => {
      const rollNumber = normalizeRollNumber(item?.rollNumber);
      const email = normalizeEmail(item?.email);
      return {
        csvRow: index + 2,
        rollNumber,
        email,
        source: item || {},
      };
    })
    .filter((row) => row.rollNumber || row.email);

  if (rows.length === 0) {
    return sendStandardResponse(res, badRequest('Please provide at least one row with a roll number or email'));
  }

  if (rows.length > MAX_BULK_RECORDS) {
    return sendStandardResponse(res, badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`));
  }

  const rollNumbers = [...new Set(rows.map((row) => row.rollNumber).filter(Boolean))];
  const emails = [...new Set(rows.map((row) => row.email).filter(Boolean))];
  const scope = getHostelScope(req.user);

  const studentsByRoll = new Map();
  if (rollNumbers.length > 0) {
    const foundByRoll = filterStudentsInScope(
      await studentProfileQueries.findByRollNumbers(rollNumbers, {
        populate: CONSISTENCY_POPULATE,
        lean: true,
      }),
      scope
    );
    foundByRoll.forEach((student) => {
      const comparable = toComparableStudent(student);
      if (comparable.rollNumber) studentsByRoll.set(comparable.rollNumber, comparable);
    });
  }

  const studentsByEmail = new Map();
  if (emails.length > 0) {
    const users = await userQueries.findUsersByEmailsCI(emails, {
      select: '_id email',
      lean: true,
    });
    const userIds = users.map((user) => user?._id).filter(Boolean);
    if (userIds.length > 0) {
      const foundByUser = filterStudentsInScope(
        await studentProfileQueries.findByUserIds(userIds, {
          populate: CONSISTENCY_POPULATE,
          lean: true,
        }),
        scope
      );
      foundByUser.forEach((student) => {
        const comparable = toComparableStudent(student);
        if (comparable.email) studentsByEmail.set(comparable.email, comparable);
      });
    }
  }

  const notInSystem = [];
  const emailsNotInSystem = [];
  const identityMismatches = [];
  const fieldMismatchesByRoll = [];
  const fieldMismatchesByEmail = [];
  const seenNotInSystemRolls = new Set();
  const seenNotInSystemEmails = new Set();
  const seenIdentityKeys = new Set();

  const pushIdentity = (entry) => {
    const key = `${entry.type}|${entry.csvRollNumber}|${entry.csvEmail}|${entry.systemRollNumber}|${entry.systemEmail}`;
    if (seenIdentityKeys.has(key)) return;
    seenIdentityKeys.add(key);
    identityMismatches.push(entry);
  };

  rows.forEach((row) => {
    const studentByRoll = row.rollNumber ? studentsByRoll.get(row.rollNumber) : null;
    const studentByEmail = row.email ? studentsByEmail.get(row.email) : null;

    if (row.rollNumber && !studentByRoll && !seenNotInSystemRolls.has(row.rollNumber)) {
      seenNotInSystemRolls.add(row.rollNumber);
      notInSystem.push({
        csvRow: row.csvRow,
        rollNumber: row.rollNumber,
        email: row.email || '',
      });
    }

    if (row.email && !studentByEmail && !seenNotInSystemEmails.has(row.email)) {
      seenNotInSystemEmails.add(row.email);
      emailsNotInSystem.push({
        csvRow: row.csvRow,
        rollNumber: row.rollNumber || '',
        email: row.email,
      });
    }

    if (studentByRoll) {
      const mismatches = collectFieldMismatches(row.source, studentByRoll, COMPARABLE_FIELDS);
      if (mismatches.length > 0) {
        fieldMismatchesByRoll.push({
          csvRow: row.csvRow,
          rollNumber: row.rollNumber,
          csvEmail: row.email || '',
          systemEmail: studentByRoll.email || '',
          mismatches,
        });
      }

      if (row.email && row.email !== (studentByRoll.email || '')) {
        pushIdentity({
          type: 'roll_to_email',
          csvRow: row.csvRow,
          csvRollNumber: row.rollNumber,
          csvEmail: row.email,
          systemRollNumber: studentByRoll.rollNumber,
          systemEmail: studentByRoll.email,
          message: 'CSV email does not match the student found by this roll number',
        });
      }
    }

    if (!studentByEmail) return;

    const emailRollMatchesCsv = Boolean(row.rollNumber) && studentByEmail.rollNumber === row.rollNumber;
    if (emailRollMatchesCsv) return;

    pushIdentity({
      type: 'email_to_roll',
      csvRow: row.csvRow,
      csvRollNumber: row.rollNumber || '',
      csvEmail: row.email,
      systemRollNumber: studentByEmail.rollNumber,
      systemEmail: studentByEmail.email,
      message: row.rollNumber
        ? 'CSV roll number does not match the student found by this email'
        : 'CSV email matches a student whose roll number was not in this row',
    });

    const mismatches = collectFieldMismatches(
      row.source,
      studentByEmail,
      COMPARABLE_FIELDS.filter((field) => field !== 'email')
    );
    const rollMismatch = row.rollNumber && studentByEmail.rollNumber !== row.rollNumber
      ? [{ field: 'rollNumber', csvValue: row.rollNumber, systemValue: studentByEmail.rollNumber || '' }]
      : [];

    if (rollMismatch.length > 0 || mismatches.length > 0) {
      fieldMismatchesByEmail.push({
        csvRow: row.csvRow,
        csvEmail: row.email,
        csvRollNumber: row.rollNumber || '',
        systemRollNumber: studentByEmail.rollNumber || '',
        systemEmail: studentByEmail.email || '',
        mismatches: [...rollMismatch, ...mismatches],
      });
    }
  });

  const foundByRollCount = studentsByRoll.size;
  const matchingByRollCount = foundByRollCount - new Set(fieldMismatchesByRoll.map((entry) => entry.rollNumber)).size;

  return sendStandardResponse(res, {
    success: true,
    statusCode: 200,
    data: {
      submittedCount: submitted.length,
      checkedCount: rows.length,
      uniqueRollCount: rollNumbers.length,
      uniqueEmailCount: emails.length,
      foundByRollCount,
      foundByEmailCount: studentsByEmail.size,
      matchingByRollCount: Math.max(0, matchingByRollCount),
      notInSystemCount: notInSystem.length,
      notInSystem,
      emailsNotInSystemCount: emailsNotInSystem.length,
      emailsNotInSystem,
      identityMismatchCount: identityMismatches.length,
      identityMismatches,
      fieldMismatchByRollCount: fieldMismatchesByRoll.length,
      fieldMismatchesByRoll,
      fieldMismatchByEmailCount: fieldMismatchesByEmail.length,
      fieldMismatchesByEmail,
    },
    message: notInSystem.length > 0 || identityMismatches.length > 0 || fieldMismatchesByRoll.length > 0
      ? 'Data consistency check completed with mismatches'
      : 'Uploaded student details match the system',
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
  const scope = getHostelScope(req.user);
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const students = await findStudentsByRollNumbersInScope(rollNumbers, scope, { session });

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
      await studentProfileOwner.bulkWrite(bulkOperations, { session, ordered: false });
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

  const scope = getHostelScope(req.user);
  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const selectionResult = await resolveBatchAssignmentRollNumbers({
        session,
        rollNumbers,
        rollNumberRange,
        scope,
      });

      if (!selectionResult.success) {
        responsePayload = badRequest(selectionResult.message);
        return;
      }

      const normalizedRollNumbers = selectionResult.rollNumbers;
      const studentBatchesConfig = await configQueries.findByKey('studentBatches', { session });
      const configuredBatches = studentBatchesConfig?.value || {};

      if (!hasConfiguredBatch(configuredBatches, { degree, department, batch })) {
        responsePayload = badRequest('The selected batch is not configured for the selected academic combination');
        return;
      }

      const existingStudents = await findStudentsByRollNumbersInScope(normalizedRollNumbers, scope, { select: 'rollNumber', session });
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
        // "Replace" clears the batch off everyone currently holding it. For a
        // hostel-bound caller "everyone" means their own hostel, so the clear is
        // resolved to ids first rather than run as a system-wide match.
        const clearMatch = buildBatchScopeStudentMatch({ degree, department, batch });
        const clearFilter = isHostelScoped(scope)
          ? { _id: { $in: await findProfileIdsInScope(clearMatch, scope, { session }) } }
          : clearMatch;

        const clearedStudents = await studentProfileOwner.updateMany(
          clearFilter,
          { $set: { batch: '' } },
          { session }
        );
        clearedCount = clearedStudents.modifiedCount || 0;
      }

      const students = await studentProfileOwner.updateMany(
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

  const scope = getHostelScope(req.user);
  const session = await mongoose.startSession();

  try {
    let responsePayload = null;

    await session.withTransaction(async () => {
      const selectionResult = await resolveBatchAssignmentRollNumbers({
        session,
        rollNumbers,
        rollNumberRange,
        scope,
      });

      if (!selectionResult.success) {
        responsePayload = badRequest(selectionResult.message);
        return;
      }

      const studentGroupsConfig = await configQueries.findByKey('studentGroups', { session });
      const configuredGroups = normalizeGroupNames(studentGroupsConfig?.value || []);
      const configuredGroupsLookup = new Set(configuredGroups);
      const invalidGroups = normalizedGroupNames.filter((groupName) => !configuredGroupsLookup.has(groupName));

      if (invalidGroups.length > 0) {
        responsePayload = badRequest(`These groups are not configured: ${invalidGroups.join(', ')}`);
        return;
      }

      const normalizedRollNumbers = selectionResult.rollNumbers;
      const existingStudents = await findStudentsByRollNumbersInScope(normalizedRollNumbers, scope, { select: 'rollNumber', session });
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
        students = await studentProfileOwner.updateMany(
          { rollNumber: { $in: existingRollNumbers } },
          { $addToSet: { groups: { $each: normalizedGroupNames } } },
          { session }
        );
      } else if (assignmentMode === GROUP_ASSIGNMENT_MODE_REMOVE) {
        students = await studentProfileOwner.updateMany(
          { rollNumber: { $in: existingRollNumbers } },
          { $pull: { groups: { $in: normalizedGroupNames } } },
          { session }
        );
      } else {
        // As with batch replace, the membership wipe stays inside the caller's
        // hostel when they have one.
        const clearMatch = { groups: { $in: normalizedGroupNames } };
        const clearFilter = isHostelScoped(scope)
          ? { _id: { $in: await findProfileIdsInScope(clearMatch, scope, { session }) } }
          : clearMatch;

        const clearedStudents = await studentProfileOwner.updateMany(
          clearFilter,
          { $pull: { groups: { $in: normalizedGroupNames } } },
          { session }
        );
        clearedCount = clearedStudents.modifiedCount || 0;

        students = await studentProfileOwner.updateMany(
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
  checkStudentDataConsistency,
  bulkUpdateStudentsStatus,
  bulkUpdateDayScholarDetails,
  bulkUpdateStudentsBatch,
  bulkUpdateStudentsGroups,
};

export default profilesAdminBulkModule;
