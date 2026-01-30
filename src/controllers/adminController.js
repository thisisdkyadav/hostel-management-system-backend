/**
 * Admin Controller
 * Handles HTTP requests for admin operations.
 * All business logic delegated to adminService.
 * 
 * @module controllers/admin
 */

import { adminService } from '../services/admin.service.js';

/**
 * Create a security user
 */
export const createSecurity = async (req, res) => {
  try {
    const result = await adminService.createSecurity(req.body);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      security: result.data.security,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all securities
 */
export const getAllSecurities = async (req, res) => {
  try {
    const result = await adminService.getAllSecurities();
    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update a security
 */
export const updateSecurity = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.updateSecurity(id, req.body);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete a security
 */
export const deleteSecurity = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteSecurity(id);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update user password
 */
export const updateUserPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const result = await adminService.updateUserPassword(email, newPassword);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      success: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Create a maintenance staff
 */
export const createMaintenanceStaff = async (req, res) => {
  try {
    const result = await adminService.createMaintenanceStaff(req.body);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({
      message: result.message,
      success: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get all maintenance staff
 */
export const getAllMaintenanceStaff = async (req, res) => {
  try {
    const result = await adminService.getAllMaintenanceStaff();
    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Update a maintenance staff
 */
export const updateMaintenanceStaff = async (req, res) => {
  console.log('Updating maintenance staff with data:', req.body);

  try {
    const { id } = req.params;
    const result = await adminService.updateMaintenanceStaff(id, req.body);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Delete a maintenance staff
 */
export const deleteMaintenanceStaff = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await adminService.deleteMaintenanceStaff(id);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get task statistics
 */
export const getTaskStats = async (req, res) => {
  try {
    const result = await adminService.getTaskStats();
    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching task stats:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get list of departments
 */
export const getDepartmentsList = async (req, res) => {
  try {
    const result = await adminService.getDepartmentsList();
    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Rename a department
 */
export const renameDepartment = async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    const result = await adminService.renameDepartment(oldName, newName);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get list of degrees
 */
export const getDegreesList = async (req, res) => {
  try {
    const result = await adminService.getDegreesList();
    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Rename a degree
 */
export const renameDegree = async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    const result = await adminService.renameDegree(oldName, newName);

    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }

    return res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get maintenance staff statistics
 */
export const getMaintenanceStaffStats = async (req, res) => {
  try {
    const { staffId } = req.params;
    const result = await adminService.getMaintenanceStaffStats(staffId);
    return res.status(result.statusCode).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};
