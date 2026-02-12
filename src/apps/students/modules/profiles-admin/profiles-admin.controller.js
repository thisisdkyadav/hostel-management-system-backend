/**
 * Profiles Admin Controller
 * Handles admin/staff-facing student profile and directory operations.
 */

import { profilesAdminService } from './profiles-admin.service.js';
import { asyncHandler } from '../../../../utils/index.js';

export const createStudentsProfiles = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.createStudentsProfiles(req.body);

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});

export const updateStudentsProfiles = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.updateStudentsProfiles(req.body, req.user);

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});

export const updateRoomAllocations = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.updateRoomAllocations(req.params.hostelId, req.body);

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});

export const getStudents = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.getStudents(req.query, req.user);

  res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    pagination: result.pagination,
    meta: result.meta,
  });
});

export const getStudentDetails = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.getStudentDetails(req.params.userId);

  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
    });
  }

  return res.status(result.statusCode).json({
    success: true,
    data: result.data,
  });
});

export const getMultipleStudentDetails = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.getMultipleStudentDetails(req.body.userIds);

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});

export const getStudentId = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.getStudentId(req.params.userId);
  res.status(result.statusCode).json({ success: result.success, data: result.data });
});

export const updateStudentProfile = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.updateStudentProfile(req.params.userId, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
    });
  }

  res.status(result.statusCode).json({
    success: true,
    message: result.message,
  });
});

export const bulkUpdateStudentsStatus = asyncHandler(async (req, res) => {
  const { status, rollNumbers } = req.body;
  const result = await profilesAdminService.bulkUpdateStudentsStatus(status, rollNumbers);

  if (!result.success) {
    return res.status(result.statusCode).json({
      message: result.message,
      unsuccessfulRollNumbers: result.unsuccessfulRollNumbers,
    });
  }

  res.status(result.statusCode).json({
    message: result.message,
    updatedCount: result.updatedCount,
    unsuccessfulRollNumbers: result.unsuccessfulRollNumbers,
  });
});

export const bulkUpdateDayScholarDetails = asyncHandler(async (req, res) => {
  const { data } = req.body;
  const result = await profilesAdminService.bulkUpdateDayScholarDetails(data);

  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});

export const getDepartmentsList = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.getDepartmentsList();
  return res.status(result.statusCode).json(result.data);
});

export const renameDepartment = asyncHandler(async (req, res) => {
  const { oldName, newName } = req.body;
  const result = await profilesAdminService.renameDepartment(oldName, newName);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({ message: result.message });
});

export const getDegreesList = asyncHandler(async (req, res) => {
  const result = await profilesAdminService.getDegreesList();
  return res.status(result.statusCode).json(result.data);
});

export const renameDegree = asyncHandler(async (req, res) => {
  const { oldName, newName } = req.body;
  const result = await profilesAdminService.renameDegree(oldName, newName);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({ message: result.message });
});
