/**
 * User Controller
 * Handles HTTP requests for user operations.
 * Business logic delegated to UserService.
 * 
 * @module controllers/user
 */

import { userService } from '../services/user.service.js';

/**
 * Search users by name or email
 * @route GET /api/users/search
 */
export const searchUsers = async (req, res) => {
  try {
    const result = await userService.searchUsers(req.query);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get user by ID
 * @route GET /api/users/:id
 */
export const getUserById = async (req, res) => {
  try {
    const result = await userService.getUserById(req.params.id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Get users by role
 * @route GET /api/users/by-role
 */
export const getUsersByRole = async (req, res) => {
  try {
    const result = await userService.getUsersByRole(req.query.role);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error fetching users by role:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Bulk update user passwords
 * @route POST /api/users/bulk-password-update
 */
export const bulkPasswordUpdate = async (req, res) => {
  try {
    const result = await userService.bulkPasswordUpdate(req.body.passwordUpdates);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error in bulk password update:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Remove password for a specific user
 * @route POST /api/users/:id/remove-password
 */
export const removeUserPassword = async (req, res) => {
  try {
    const result = await userService.removeUserPassword(req.params.id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error removing user password:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Bulk remove passwords for specified users
 * @route POST /api/users/bulk-remove-passwords
 */
export const bulkRemovePasswords = async (req, res) => {
  try {
    const result = await userService.bulkRemovePasswords(req.body.emails);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error in bulk password removal:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Remove passwords for all users with a specific role
 * @route POST /api/users/remove-passwords-by-role
 */
export const removePasswordsByRole = async (req, res) => {
  try {
    const result = await userService.removePasswordsByRole(req.body.role);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error removing passwords by role:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
