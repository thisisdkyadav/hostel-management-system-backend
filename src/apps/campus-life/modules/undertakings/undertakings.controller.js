/**
 * Undertaking Controller
 * Handles HTTP requests and responses for undertaking operations.
 * Business logic is delegated to undertakingService.
 * 
 * @module controllers/undertakingController
 */

import { undertakingService } from './undertakings.service.js';
import { asyncHandler } from '../../../../utils/index.js';

// Admin APIs

// 1. Get All Undertakings
export const getAllUndertakings = asyncHandler(async (req, res) => {
  const result = await undertakingService.getAllUndertakings();
  res.status(result.statusCode).json(result.data);
});

// 2. Create Undertaking
export const createUndertaking = asyncHandler(async (req, res) => {
  const result = await undertakingService.createUndertaking(req.body, req.user);
  res.status(result.statusCode).json({
    message: result.message,
    undertaking: result.data.undertaking,
  });
});

// 3. Update Undertaking
export const updateUndertaking = asyncHandler(async (req, res) => {
  const result = await undertakingService.updateUndertaking(req.params.undertakingId, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    undertaking: result.data.undertaking,
  });
});

// 4. Delete Undertaking
export const deleteUndertaking = asyncHandler(async (req, res) => {
  const result = await undertakingService.deleteUndertaking(req.params.undertakingId);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    undertakingId: result.data.undertakingId,
  });
});

// 5. Get Students Assigned to Undertaking
export const getAssignedStudents = asyncHandler(async (req, res) => {
  const result = await undertakingService.getAssignedStudents(req.params.undertakingId);
  res.status(result.statusCode).json(result.data);
});

// 6. Add Students to Undertaking
export const addStudentsToUndertaking = asyncHandler(async (req, res) => {
  const result = await undertakingService.addStudentsToUndertaking(
    req.params.undertakingId,
    req.body.rollNumbers
  );
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    addedCount: result.data.addedCount,
    undertakingId: result.data.undertakingId,
    addedStudents: result.data.addedStudents,
  });
});

// 7. Remove Student from Undertaking
export const removeStudentFromUndertaking = asyncHandler(async (req, res) => {
  const result = await undertakingService.removeStudentFromUndertaking(
    req.params.undertakingId,
    req.params.studentId
  );
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    undertakingId: result.data.undertakingId,
    studentId: result.data.studentId,
  });
});

// 8. Get Undertaking Acceptance Status
export const getUndertakingStatus = asyncHandler(async (req, res) => {
  const result = await undertakingService.getUndertakingStatus(req.params.undertakingId);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

// Student APIs

// 9. Get Student's Pending Undertakings
export const getStudentPendingUndertakings = asyncHandler(async (req, res) => {
  const result = await undertakingService.getStudentPendingUndertakings(req.user._id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

// 10. Get Undertaking Details (Student view)
export const getUndertakingDetails = asyncHandler(async (req, res) => {
  const result = await undertakingService.getUndertakingDetails(
    req.params.undertakingId,
    req.user._id
  );
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

// 11. Accept Undertaking
export const acceptUndertaking = asyncHandler(async (req, res) => {
  const result = await undertakingService.acceptUndertaking(
    req.params.undertakingId,
    req.body.accepted,
    req.user._id
  );
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    undertakingId: result.data.undertakingId,
    acceptedAt: result.data.acceptedAt,
  });
});

// 12. Get Student's Accepted Undertakings
export const getStudentAcceptedUndertakings = asyncHandler(async (req, res) => {
  const result = await undertakingService.getStudentAcceptedUndertakings(req.user._id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

// 13. Get Student's Pending Undertakings Count
export const getStudentPendingUndertakingsCount = asyncHandler(async (req, res) => {
  const result = await undertakingService.getStudentPendingUndertakingsCount(req.user._id);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});
