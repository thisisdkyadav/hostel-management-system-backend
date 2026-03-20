import { Configuration, StudentProfile } from '../../../../models/index.js';
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
  const departments = await StudentProfile.distinct('department');

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
    const departments = await Configuration.findOne({ key: 'departments' }).session(session);
    if (!departments) {
      return notFound('Departments configuration not found');
    }
    const studentBatches = await Configuration.findOne({ key: 'studentBatches' }).session(session);

    await StudentProfile.updateMany(
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
  const degrees = await StudentProfile.distinct('degree');

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
    const degrees = await Configuration.findOne({ key: 'degrees' }).session(session);
    if (!degrees) {
      return notFound('Degrees configuration not found');
    }
    const studentBatches = await Configuration.findOne({ key: 'studentBatches' }).session(session);

    await StudentProfile.updateMany(
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
    const studentGroups = await Configuration.findOne({ key: 'studentGroups' }).session(session);
    if (!studentGroups) {
      return notFound('Student groups configuration not found');
    }

    await StudentProfile.updateMany(
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
      { session }
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
    const studentBatches = await Configuration.findOne({ key: 'studentBatches' }).session(session);
    if (!studentBatches) {
      return notFound('Student batches configuration not found');
    }

    const normalizedNewName = String(newName).trim();

    await StudentProfile.updateMany(
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
