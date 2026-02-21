/**
 * Visitors Controller
 * Handles HTTP requests and responses for visitor request operations.
 * Business logic is delegated to visitorsService.
 * 
 * @module apps/visitors/modules/visitors/controller
 */

import { visitorsService } from './visitors.service.js';
import { asyncHandler } from '../../../../utils/index.js';

export const createVisitorRequest = asyncHandler(async (req, res) => {
  const result = await visitorsService.createVisitorRequest(req.body, req.user);
  
  res.status(result.statusCode).json({
    message: result.message,
    visitorRequest: result.data,
    success: result.success,
  });
});

export const getVisitorRequests = asyncHandler(async (req, res) => {
  const result = await visitorsService.getVisitorRequests(req.user, req.query);
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    data: result.data,
    pagination: result.pagination,
  });
});

export const getVisitorRequestById = asyncHandler(async (req, res) => {
  const result = await visitorsService.getVisitorRequestById(req.params.requestId);
  
  if (!result.success) {
    return res.status(result.statusCode).json({
      message: result.message,
      success: false,
    });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    data: result.data,
  });
});

export const updateVisitorRequest = asyncHandler(async (req, res) => {
  const result = await visitorsService.updateVisitorRequest(req.params.requestId, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({
      message: result.message,
      success: false,
    });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    updatedRequest: result.data,
  });
});

export const deleteVisitorRequest = asyncHandler(async (req, res) => {
  const result = await visitorsService.deleteVisitorRequest(req.params.requestId);
  
  if (!result.success) {
    return res.status(result.statusCode).json({
      message: result.message,
      success: false,
    });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
  });
});

export const updateVisitorRequestStatus = asyncHandler(async (req, res) => {
  const result = await visitorsService.updateVisitorRequestStatus(
    req.params.requestId,
    req.params.action,
    req.body
  );
  
  if (!result.success) {
    return res.status(result.statusCode).json({
      message: result.message,
      success: false,
    });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    updatedRequest: result.data,
  });
});

export const allocateRoomsToVisitorRequest = asyncHandler(async (req, res) => {
  const result = await visitorsService.allocateRoomsToVisitorRequest(
    req.params.requestId,
    req.body.allocationData,
    req.user
  );
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    updatedRequest: result.data,
  });
});

export const checkInVisitor = asyncHandler(async (req, res) => {
  const result = await visitorsService.checkInVisitor(req.params.requestId, req.body);
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    updatedRequest: result.data,
  });
});

export const checkOutVisitor = asyncHandler(async (req, res) => {
  const result = await visitorsService.checkOutVisitor(req.params.requestId, req.body);
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    updatedRequest: result.data,
  });
});

export const updateCheckTime = asyncHandler(async (req, res) => {
  const result = await visitorsService.updateCheckTime(req.params.requestId, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({
      message: result.message,
      success: false,
    });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    updatedRequest: result.data,
  });
});

export const getStudentVisitorRequests = asyncHandler(async (req, res) => {
  const result = await visitorsService.getStudentVisitorRequests(req.params.userId);
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    data: result.data,
  });
});

export const updatePaymentInfo = asyncHandler(async (req, res) => {
  const result = await visitorsService.updatePaymentInfo(
    req.params.requestId,
    req.body,
    req.user
  );
  
  if (!result.success) {
    return res.status(result.statusCode).json({
      message: result.message,
      success: false,
    });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    updatedRequest: result.data,
  });
});
