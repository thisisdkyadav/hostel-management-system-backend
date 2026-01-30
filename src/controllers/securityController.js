/**
 * Security Controller
 * Handles HTTP requests for security/check-in-out operations.
 * All business logic delegated to securityService.
 * 
 * @module controllers/security
 */

import { securityService } from '../services/security.service.js';

/**
 * Get security details for current user
 */
export const getSecurity = async (req, res) => {
  try {
    const result = await securityService.getSecurity(req.user._id);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching security:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Add student entry with room details
 */
export const addStudentEntry = async (req, res) => {
  try {
    const result = await securityService.addStudentEntry(req.user, req.body);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      success: true,
      studentEntry: result.data.studentEntry,
    });
  } catch (error) {
    console.error('Error adding student entry:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * Add student entry with email
 */
export const addStudentEntryWithEmail = async (req, res) => {
  try {
    const result = await securityService.addStudentEntryWithEmail(req.user, req.body);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      success: true,
      studentEntry: result.data.studentEntry,
    });
  } catch (error) {
    console.error('Error adding student entry:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

/**
 * Get recent entries for a hostel
 */
export const getRecentEntries = async (req, res) => {
  try {
    const result = await securityService.getRecentEntries(req.user);
    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching recent entries:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get student entries with filters
 */
export const getStudentEntries = async (req, res) => {
  try {
    const result = await securityService.getStudentEntries(req.user, req.query);

    return res.status(result.statusCode).json({
      studentEntries: result.data.studentEntries,
      meta: result.data.meta,
    });
  } catch (error) {
    console.error('Error fetching student entries:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update a student entry
 */
export const updateStudentEntry = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error updating student entry:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Add a visitor
 */
export const addVisitor = async (req, res) => {
  try {
    const result = await securityService.addVisitor(req.user._id, req.body);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      visitor: result.data.visitor,
    });
  } catch (error) {
    console.error('Error adding visitor:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get visitors for a hostel
 */
export const getVisitors = async (req, res) => {
  try {
    const result = await securityService.getVisitors(req.user);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching visitors:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update a visitor
 */
export const updateVisitor = async (req, res) => {
  try {
    const { visitorId } = req.params;
    const result = await securityService.updateVisitor(visitorId, req.body);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      visitor: result.data.visitor,
    });
  } catch (error) {
    console.error('Error updating visitor:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Delete a student entry
 */
export const deleteStudentEntry = async (req, res) => {
  try {
    const { entryId } = req.params;
    const result = await securityService.deleteStudentEntry(entryId);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      success: true,
    });
  } catch (error) {
    console.error('Error deleting student entry:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Delete a visitor
 */
export const deleteVisitor = async (req, res) => {
  try {
    const { visitorId } = req.params;
    const result = await securityService.deleteVisitor(visitorId);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      success: true,
    });
  } catch (error) {
    console.error('Error deleting visitor:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Verify QR code
 */
export const verifyQR = async (req, res) => {
  try {
    const result = await securityService.verifyQR(req.user, req.body);

    if (!result.success) {
      return res.status(result.statusCode).json({ error: result.message });
    }

    return res.json({
      success: true,
      studentProfile: result.data.studentProfile,
      lastCheckInOut: result.data.lastCheckInOut,
    });
  } catch (error) {
    console.error('Error verifying QR code:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Update cross-hostel reason for a student entry
 */
export const updateStudentEntryCrossHostelReason = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error updating student entry:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * Get face scanner entries for hostel gate
 */
export const getFaceScannerEntries = async (req, res) => {
  try {
    const result = await securityService.getFaceScannerEntries(req.user, req.query);

    return res.status(result.statusCode).json({
      success: true,
      entries: result.data.entries,
      pendingCrossHostelEntries: result.data.pendingCrossHostelEntries,
      pagination: result.data.pagination,
    });
  } catch (error) {
    console.error('Error fetching face scanner entries:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
