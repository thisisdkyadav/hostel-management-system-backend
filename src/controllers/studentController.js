/**
 * Student Controller
 * Handles HTTP requests and responses for student operations.
 * Business logic is delegated to studentService.
 * 
 * @module controllers/studentController
 */

import { studentService } from '../services/student.service.js';
import { asyncHandler } from '../utils/index.js';

export const createStudentsProfiles = asyncHandler(async (req, res) => {
  const result = await studentService.createStudentsProfiles(req.body);
  
  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});

export const updateStudentsProfiles = asyncHandler(async (req, res) => {
  const result = await studentService.updateStudentsProfiles(req.body, req.user);
  
  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});

export const updateRoomAllocations = asyncHandler(async (req, res) => {
  const result = await studentService.updateRoomAllocations(req.params.hostelId, req.body);
  
  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});

export const getStudents = asyncHandler(async (req, res) => {
  const result = await studentService.getStudents(req.query, req.user);
  
  res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    pagination: result.pagination,
    meta: result.meta,
  });
});

export const getStudentDetails = asyncHandler(async (req, res) => {
  const result = await studentService.getStudentDetails(req.params.userId);
  
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
  const result = await studentService.getMultipleStudentDetails(req.body.userIds);
  
  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});

export const getStudentProfile = asyncHandler(async (req, res) => {
  const result = await studentService.getStudentProfile(req.user._id);
  
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

export const getStudentId = asyncHandler(async (req, res) => {
  const result = await studentService.getStudentId(req.params.userId);
  res.status(result.statusCode).json({ success: result.success, data: result.data });
});

export const updateStudentProfile = asyncHandler(async (req, res) => {
  const result = await studentService.updateStudentProfile(req.params.userId, req.body);
  
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

export const getStudentDashboard = asyncHandler(async (req, res) => {
  const result = await studentService.getStudentDashboard(req.user._id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ 
      success: false, 
      message: result.message 
    });
  }

  return res.status(result.statusCode).json({
    success: true,
    data: result.data,
  });
});

export const fileComplaint = asyncHandler(async (req, res) => {
  const result = await studentService.fileComplaint(req.params.userId, req.body);
  
  res.status(result.statusCode).json(result.data);
});

export const getAllComplaints = asyncHandler(async (req, res) => {
  const result = await studentService.getAllComplaints(req.params.userId);
  
  res.status(result.statusCode).json(result.data);
});

export const updateComplaint = asyncHandler(async (req, res) => {
  const result = await studentService.updateComplaint(req.params.complaintId, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
});

export const deleteComplaint = asyncHandler(async (req, res) => {
  const result = await studentService.deleteComplaint(req.params.complaintId);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message });
});

export const getStudentIdCard = asyncHandler(async (req, res) => {
  const result = await studentService.getStudentIdCard(req.params.userId, req.user);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

export const uploadStudentIdCard = asyncHandler(async (req, res) => {
  const result = await studentService.uploadStudentIdCard(req.user, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({ message: result.message });
});

export const bulkUpdateStudentsStatus = asyncHandler(async (req, res) => {
  const { status, rollNumbers } = req.body;
  const result = await studentService.bulkUpdateStudentsStatus(status, rollNumbers);
  
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
  const result = await studentService.bulkUpdateDayScholarDetails(data);
  
  return res.status(result.statusCode).json({
    success: result.success,
    data: result.data,
    errors: result.errors,
    message: result.message,
  });
});
