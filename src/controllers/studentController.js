/**
 * Student Controller
 * Handles HTTP requests and responses for student operations.
 * Business logic is delegated to studentService.
 * 
 * @module controllers/studentController
 */

import { studentService } from '../services/student.service.js';
import { isDevelopmentEnvironment } from '../../config/environment.js';

export const createStudentsProfiles = async (req, res) => {
  try {
    const result = await studentService.createStudentsProfiles(req.body);
    
    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
      errors: result.errors,
      message: result.message,
    });
  } catch (error) {
    console.error('Create students profiles error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create student profiles',
      error: error.message,
    });
  }
};

export const updateStudentsProfiles = async (req, res) => {
  try {
    const result = await studentService.updateStudentsProfiles(req.body, req.user);
    
    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
      errors: result.errors,
      message: result.message,
    });
  } catch (error) {
    console.error('Update student profile error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update student profile(s)',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

export const updateRoomAllocations = async (req, res) => {
  try {
    const result = await studentService.updateRoomAllocations(req.params.hostelId, req.body);
    
    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
      errors: result.errors,
      message: result.message,
    });
  } catch (err) {
    console.error('Error in updateRoomAllocations:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to update room allocations',
      error: err.message,
    });
  }
};

export const getStudents = async (req, res) => {
  try {
    const result = await studentService.getStudents(req.query, req.user);
    
    res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
      pagination: result.pagination,
      meta: result.meta,
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve students',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

export const getStudentDetails = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get student details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve student details',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

export const getMultipleStudentDetails = async (req, res) => {
  try {
    const result = await studentService.getMultipleStudentDetails(req.body.userIds);
    
    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
      errors: result.errors,
      message: result.message,
    });
  } catch (error) {
    console.error('Get multiple student details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve student details',
      error: isDevelopmentEnvironment ? error.message : undefined,
    });
  }
};

export const getStudentProfile = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get student profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve student profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const getStudentId = async (req, res) => {
  const result = await studentService.getStudentId(req.params.userId);
  res.status(result.statusCode).json({ success: result.success, data: result.data });
};

export const updateStudentProfile = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Update student profile error:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `Duplicate value: ${Object.keys(error.keyPattern)[0]} already exists`,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update student profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const getStudentDashboard = async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Get student dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve student dashboard information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
};

export const fileComplaint = async (req, res) => {
  try {
    const result = await studentService.fileComplaint(req.params.userId, req.body);
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getAllComplaints = async (req, res) => {
  try {
    const result = await studentService.getAllComplaints(req.params.userId);
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const updateComplaint = async (req, res) => {
  try {
    const result = await studentService.updateComplaint(req.params.complaintId, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const deleteComplaint = async (req, res) => {
  try {
    const result = await studentService.deleteComplaint(req.params.complaintId);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const getStudentIdCard = async (req, res) => {
  try {
    const result = await studentService.getStudentIdCard(req.params.userId, req.user);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const uploadStudentIdCard = async (req, res) => {
  try {
    const result = await studentService.uploadStudentIdCard(req.user, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const bulkUpdateStudentsStatus = async (req, res) => {
  try {
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
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

export const bulkUpdateDayScholarDetails = async (req, res) => {
  try {
    const { data } = req.body;
    const result = await studentService.bulkUpdateDayScholarDetails(data);
    
    return res.status(result.statusCode).json({
      success: result.success,
      data: result.data,
      errors: result.errors,
      message: result.message,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
