import { studentProfileOwner } from '../../../../services/student/studentProfileOwner.service.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { configQueries } from '../../../../services/config/configQueries.service.js';
import { badRequest, notFound, withTransaction } from '../../../../services/base/index.js';
import { asyncHandler, sendStandardResponse } from '../../../../utils/index.js';
import {
  MIXED_BATCH_SCOPE_KEY,
  buildBatchScopeStudentMatch,
  getBatchOptionsFromConfig,
  renameBatchInConfig,
  renameDegreeInConfig,
  renameDepartmentInConfig,
} from '../../../../utils/index.js';
import { getConfigWithDefault } from '../../../../utils/configDefaults.js';

export const getDepartmentsList = asyncHandler(async (req, res) => {
  const departments = await studentProfileQueries.distinctField('department');

  return sendStandardResponse(res, {
    success: true,
    statusCode: 200,
    data: {
      departments,
    },
    message: 'Departments fetched successfully',
  });
});

export const renameDepartment = asyncHandler(async (req, res) => {
  const { oldName, newName } = req.body;

  if (!oldName || !newName) {
    return sendStandardResponse(res, badRequest('Both oldName and newName are required'));
  }

  if (String(newName).trim() === MIXED_BATCH_SCOPE_KEY) {
    return sendStandardResponse(res, badRequest('This department name is reserved for mixed batch scopes'));
  }

  const result = await withTransaction(async (session) => {
    const departments = await configQueries.findByKey('departments', { session });
    if (!departments) {
      return notFound('Departments configuration not found');
    }
    const studentBatches = await configQueries.findByKey('studentBatches', { session });

    await studentProfileOwner.updateMany(
      { department: oldName },
      { $set: { department: newName } },
      { session }
    );

    departments.value = departments.value.map((department) => (
      department === oldName ? newName : department
    ));
    await departments.save({ session });

    if (studentBatches) {
      studentBatches.value = renameDepartmentInConfig(studentBatches.value, { oldName, newName });
      await studentBatches.save({ session });
    }

    return {
      success: true,
      statusCode: 200,
      data: null,
      message: 'Department renamed successfully',
    };
  });

  return sendStandardResponse(res, result);
});

export const getDegreesList = asyncHandler(async (req, res) => {
  const degrees = await studentProfileQueries.distinctField('degree');

  return sendStandardResponse(res, {
    success: true,
    statusCode: 200,
    data: {
      degrees,
    },
    message: 'Degrees fetched successfully',
  });
});

export const renameDegree = asyncHandler(async (req, res) => {
  const { oldName, newName } = req.body;

  if (!oldName || !newName) {
    return sendStandardResponse(res, badRequest('Both oldName and newName are required'));
  }

  if (String(newName).trim() === MIXED_BATCH_SCOPE_KEY) {
    return sendStandardResponse(res, badRequest('This degree name is reserved for mixed batch scopes'));
  }

  const result = await withTransaction(async (session) => {
    const degrees = await configQueries.findByKey('degrees', { session });
    if (!degrees) {
      return notFound('Degrees configuration not found');
    }
    const studentBatches = await configQueries.findByKey('studentBatches', { session });

    await studentProfileOwner.updateMany(
      { degree: oldName },
      { $set: { degree: newName } },
      { session }
    );

    degrees.value = degrees.value.map((degree) => (
      degree === oldName ? newName : degree
    ));
    await degrees.save({ session });

    if (studentBatches) {
      studentBatches.value = renameDegreeInConfig(studentBatches.value, { oldName, newName });
      await studentBatches.save({ session });
    }

    return {
      success: true,
      statusCode: 200,
      data: null,
      message: 'Degree renamed successfully',
    };
  });

  return sendStandardResponse(res, result);
});

/**
 * The configured taxonomy the student bulk tools validate uploads against.
 * `/config/:key` is Settings-scoped and Admin-only, so staff who manage
 * students (wardens, hostel supervisors) read the same values from here.
 */
export const getTaxonomyOptions = asyncHandler(async (req, res) => {
  const [degrees, departments, studentGroups] = await Promise.all([
    getConfigWithDefault('degrees'),
    getConfigWithDefault('departments'),
    getConfigWithDefault('studentGroups'),
  ]);

  return sendStandardResponse(res, {
    success: true,
    statusCode: 200,
    data: {
      degrees: degrees?.value || [],
      departments: departments?.value || [],
      studentGroups: studentGroups?.value || [],
    },
    message: 'Taxonomy options fetched successfully',
  });
});

export const getBatchesList = asyncHandler(async (req, res) => {
  const { degree, department } = req.query;
  const studentBatchesConfig = await getConfigWithDefault('studentBatches');
  const batches = getBatchOptionsFromConfig(studentBatchesConfig?.value || {}, { degree, department });

  return sendStandardResponse(res, {
    success: true,
    statusCode: 200,
    data: {
      batches,
    },
    message: 'Batches fetched successfully',
  });
});

export const renameGroup = asyncHandler(async (req, res) => {
  const { oldName, newName } = req.body;

  if (!oldName || !newName) {
    return sendStandardResponse(res, badRequest('Both oldName and newName are required'));
  }

  const normalizedNewName = String(newName).trim();

  if (!normalizedNewName) {
    return sendStandardResponse(res, badRequest('newName cannot be empty'));
  }

  const result = await withTransaction(async (session) => {
    const studentGroups = await configQueries.findByKey('studentGroups', { session });
    if (!studentGroups) {
      return notFound('Student groups configuration not found');
    }

    await studentProfileOwner.updateMany(
      { groups: oldName },
      [
        {
          $set: {
            groups: {
              $setUnion: [
                {
                  $map: {
                    input: { $ifNull: ['$groups', []] },
                    as: 'group',
                    in: {
                      $cond: [{ $eq: ['$$group', oldName] }, normalizedNewName, '$$group'],
                    },
                  },
                },
                [],
              ],
            },
          },
        },
      ],
      { session, updatePipeline: true }
    );

    studentGroups.value = studentGroups.value.map((group) => (
      group === oldName ? normalizedNewName : group
    ));
    await studentGroups.save({ session });

    return {
      success: true,
      statusCode: 200,
      data: null,
      message: 'Group renamed successfully',
    };
  });

  return sendStandardResponse(res, result);
});

export const renameBatch = asyncHandler(async (req, res) => {
  const { degree, department, oldName, newName } = req.body;

  if (!degree || !department || !oldName || !newName) {
    return sendStandardResponse(res, badRequest('degree scope, department scope, oldName, and newName are required'));
  }

  const result = await withTransaction(async (session) => {
    const studentBatches = await configQueries.findByKey('studentBatches', { session });
    if (!studentBatches) {
      return notFound('Student batches configuration not found');
    }

    const normalizedNewName = String(newName).trim();

    await studentProfileOwner.updateMany(
      buildBatchScopeStudentMatch({ degree, department, batch: oldName }),
      { $set: { batch: normalizedNewName } },
      { session }
    );

    studentBatches.value = renameBatchInConfig(studentBatches.value, {
      degree,
      department,
      oldName,
      newName: normalizedNewName,
    });
    await studentBatches.save({ session });

    return {
      success: true,
      statusCode: 200,
      data: null,
      message: 'Batch renamed successfully',
    };
  });

  return sendStandardResponse(res, result);
});

export const profilesAdminTaxonomyModule = {
  getDepartmentsList,
  renameDepartment,
  getDegreesList,
  renameDegree,
  getBatchesList,
  renameBatch,
  renameGroup,
};

export default profilesAdminTaxonomyModule;
