import { Configuration, StudentProfile } from '../../../../models/index.js';
import { badRequest, notFound, withTransaction } from '../../../../services/base/index.js';
import { asyncHandler, sendStandardResponse } from '../../../../utils/index.js';

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

  const result = await withTransaction(async (session) => {
    const departments = await Configuration.findOne({ key: 'departments' }).session(session);
    if (!departments) {
      return notFound('Departments configuration not found');
    }

    await StudentProfile.updateMany(
      { department: oldName },
      { $set: { department: newName } },
      { session }
    );

    departments.value = departments.value.map((department) => (
      department === oldName ? newName : department
    ));
    await departments.save({ session });

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

  const result = await withTransaction(async (session) => {
    const degrees = await Configuration.findOne({ key: 'degrees' }).session(session);
    if (!degrees) {
      return notFound('Degrees configuration not found');
    }

    await StudentProfile.updateMany(
      { degree: oldName },
      { $set: { degree: newName } },
      { session }
    );

    degrees.value = degrees.value.map((degree) => (
      degree === oldName ? newName : degree
    ));
    await degrees.save({ session });

    return {
      success: true,
      statusCode: 200,
      data: null,
      message: 'Degree renamed successfully',
    };
  });

  return sendStandardResponse(res, result);
});

export const profilesAdminTaxonomyModule = {
  getDepartmentsList,
  renameDepartment,
  getDegreesList,
  renameDegree,
};

export default profilesAdminTaxonomyModule;
