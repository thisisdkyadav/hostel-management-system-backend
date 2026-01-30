/**
 * Security Controller
 * Handles HTTP requests for security/check-in-out operations.
 * All business logic delegated to securityService.
 * 
 * @module controllers/security
 */

import { securityService } from '../services/security.service.js';
import { asyncHandler } from '../utils/index.js';

/**
 * Get security details for current user
 */
export const getSecurity = asyncHandler(async (req, res) => {
  const result = await securityService.getSecurity(req.user._id);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json(result.data);
});

/**
 * Add student entry with room details
 */
export const addStudentEntry = asyncHandler(async (req, res) => {
  const result = await securityService.addStudentEntry(req.user, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    success: true,
    studentEntry: result.data.studentEntry,
  });
});

/**
 * Add student entry with email
 */
export const addStudentEntryWithEmail = asyncHandler(async (req, res) => {
  const result = await securityService.addStudentEntryWithEmail(req.user, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    success: true,
    studentEntry: result.data.studentEntry,
  });
});

/**
 * Get recent entries for a hostel
 */
export const getRecentEntries = asyncHandler(async (req, res) => {
  const result = await securityService.getRecentEntries(req.user);
  return res.status(result.statusCode).json(result.data);
});

/**
 * Get student entries with filters
 */
export const getStudentEntries = asyncHandler(async (req, res) => {
  const result = await securityService.getStudentEntries(req.user, req.query);

  return res.status(result.statusCode).json({
    studentEntries: result.data.studentEntries,
    meta: result.data.meta,
  });
});

/**
 * Update a student entry
 */
export const updateStudentEntry = asyncHandler(async (req, res) => {
  const { entryId } = req.params;
  const result = await securityService.updateStudentEntry(entryId, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    success: true,
    studentEntry: result.data.studentEntry,
  });
});

/**
 * Add a visitor
 */
export const addVisitor = asyncHandler(async (req, res) => {
  const result = await securityService.addVisitor(req.user._id, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    visitor: result.data.visitor,
  });
});

/**
 * Get visitors for a hostel
 */
export const getVisitors = asyncHandler(async (req, res) => {
  const result = await securityService.getVisitors(req.user);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json(result.data);
});

/**
 * Update a visitor
 */
export const updateVisitor = asyncHandler(async (req, res) => {
  const { visitorId } = req.params;
  const result = await securityService.updateVisitor(visitorId, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    visitor: result.data.visitor,
  });
});

/**
 * Delete a student entry
 */
export const deleteStudentEntry = asyncHandler(async (req, res) => {
  const { entryId } = req.params;
  const result = await securityService.deleteStudentEntry(entryId);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    success: true,
  });
});

/**
 * Delete a visitor
 */
export const deleteVisitor = asyncHandler(async (req, res) => {
  const { visitorId } = req.params;
  const result = await securityService.deleteVisitor(visitorId);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    success: true,
  });
});

/**
 * Verify QR code
 */
export const verifyQR = asyncHandler(async (req, res) => {
  const result = await securityService.verifyQR(req.user, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ error: result.message });
  }

  return res.json({
    success: true,
    studentProfile: result.data.studentProfile,
    lastCheckInOut: result.data.lastCheckInOut,
  });
});

/**
 * Update cross-hostel reason for a student entry
 */
export const updateStudentEntryCrossHostelReason = asyncHandler(async (req, res) => {
  const { entryId } = req.params;
  const { reason } = req.body;
  const result = await securityService.updateStudentEntryCrossHostelReason(entryId, reason);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  return res.status(result.statusCode).json({
    message: result.message,
    success: true,
    studentEntry: result.data.studentEntry,
  });
});

/**
 * Get face scanner entries for hostel gate
 */
export const getFaceScannerEntries = asyncHandler(async (req, res) => {
  const result = await securityService.getFaceScannerEntries(req.user, req.query);

  return res.status(result.statusCode).json({
    success: true,
    entries: result.data.entries,
    pendingCrossHostelEntries: result.data.pendingCrossHostelEntries,
    pagination: result.data.pagination,
  });
});
