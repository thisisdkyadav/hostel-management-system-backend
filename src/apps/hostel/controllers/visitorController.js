/**
 * Visitor Controller
 * Handles HTTP requests and responses for visitor request operations.
 * Business logic is delegated to visitorService.
 * 
 * @module controllers/visitorController
 */

import { visitorService } from '../services/visitor.service.js';
import { asyncHandler } from '../../../utils/index.js';

export const createVisitorRequest = asyncHandler(async (req, res) => {
  const result = await visitorService.createVisitorRequest(req.body, req.user);
  
  res.status(result.statusCode).json({
    message: result.message,
    visitorRequest: result.data,
    success: result.success,
  });
});

export const getVisitorRequests = asyncHandler(async (req, res) => {
  const result = await visitorService.getVisitorRequests(req.user);
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    data: result.data,
  });
});

export const getVisitorRequestById = asyncHandler(async (req, res) => {
  const result = await visitorService.getVisitorRequestById(req.params.requestId);
  
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
  const result = await visitorService.updateVisitorRequest(req.params.requestId, req.body);
  
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
  const result = await visitorService.deleteVisitorRequest(req.params.requestId);
  
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
  const result = await visitorService.updateVisitorRequestStatus(
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
  const result = await visitorService.allocateRoomsToVisitorRequest(
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
  const result = await visitorService.checkInVisitor(req.params.requestId, req.body);
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    updatedRequest: result.data,
  });
});

export const checkOutVisitor = asyncHandler(async (req, res) => {
  const result = await visitorService.checkOutVisitor(req.params.requestId, req.body);
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    updatedRequest: result.data,
  });
});

export const updateCheckTime = asyncHandler(async (req, res) => {
  const result = await visitorService.updateCheckTime(req.params.requestId, req.body);
  
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
  const result = await visitorService.getStudentVisitorRequests(req.params.userId);
  
  res.status(result.statusCode).json({
    message: result.message,
    success: result.success,
    data: result.data,
  });
});

export const updatePaymentInfo = asyncHandler(async (req, res) => {
  const result = await visitorService.updatePaymentInfo(
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
