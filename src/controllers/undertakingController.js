/**
 * Undertaking Controller
 * Handles HTTP requests and responses for undertaking operations.
 * Business logic is delegated to undertakingService.
 * 
 * @module controllers/undertakingController
 */

import { undertakingService } from '../services/undertaking.service.js';

// Admin APIs

// 1. Get All Undertakings
export const getAllUndertakings = async (req, res) => {
  try {
    const result = await undertakingService.getAllUndertakings();
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching undertakings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 2. Create Undertaking
export const createUndertaking = async (req, res) => {
  try {
    const result = await undertakingService.createUndertaking(req.body, req.user);
    res.status(result.statusCode).json({
      message: result.message,
      undertaking: result.data.undertaking,
    });
  } catch (error) {
    console.error('Error creating undertaking:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 3. Update Undertaking
export const updateUndertaking = async (req, res) => {
  try {
    const result = await undertakingService.updateUndertaking(req.params.undertakingId, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      undertaking: result.data.undertaking,
    });
  } catch (error) {
    console.error('Error updating undertaking:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 4. Delete Undertaking
export const deleteUndertaking = async (req, res) => {
  try {
    const result = await undertakingService.deleteUndertaking(req.params.undertakingId);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      undertakingId: result.data.undertakingId,
    });
  } catch (error) {
    console.error('Error deleting undertaking:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 5. Get Students Assigned to Undertaking
export const getAssignedStudents = async (req, res) => {
  try {
    const result = await undertakingService.getAssignedStudents(req.params.undertakingId);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching assigned students:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 6. Add Students to Undertaking
export const addStudentsToUndertaking = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error adding students to undertaking:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 7. Remove Student from Undertaking
export const removeStudentFromUndertaking = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error removing student from undertaking:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 8. Get Undertaking Acceptance Status
export const getUndertakingStatus = async (req, res) => {
  try {
    const result = await undertakingService.getUndertakingStatus(req.params.undertakingId);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching undertaking status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Student APIs

// 9. Get Student's Pending Undertakings
export const getStudentPendingUndertakings = async (req, res) => {
  try {
    const result = await undertakingService.getStudentPendingUndertakings(req.user._id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching student pending undertakings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 10. Get Undertaking Details (Student view)
export const getUndertakingDetails = async (req, res) => {
  try {
    const result = await undertakingService.getUndertakingDetails(
      req.params.undertakingId,
      req.user._id
    );
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching undertaking details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 11. Accept Undertaking
export const acceptUndertaking = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error accepting undertaking:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 12. Get Student's Accepted Undertakings
export const getStudentAcceptedUndertakings = async (req, res) => {
  try {
    const result = await undertakingService.getStudentAcceptedUndertakings(req.user._id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching student accepted undertakings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// 13. Get Student's Pending Undertakings Count
export const getStudentPendingUndertakingsCount = async (req, res) => {
  try {
    const result = await undertakingService.getStudentPendingUndertakingsCount(req.user._id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching student pending undertakings count:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};
