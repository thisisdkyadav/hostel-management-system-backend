/**
 * Permission Service
 * Contains all business logic for user permission operations.
 * 
 * @module services/permission
 */

import User from '../../models/User.js';
import { getDefaultPermissions } from '../../utils/permissions.js';
import { success, notFound, badRequest } from './base/index.js';

const VALID_ROLES = [
  'Student',
  'Maintenance Staff',
  'Warden',
  'Associate Warden',
  'Admin',
  'Security',
  'Super Admin',
  'Hostel Supervisor',
  'Hostel Gate',
];

class PermissionService {
  /**
   * Convert permissions Map to plain object
   * @private
   */
  _mapToObject(permissionsMap) {
    const permissionsObject = {};
    if (permissionsMap) {
      for (const [key, value] of permissionsMap.entries()) {
        permissionsObject[key] = value;
      }
    }
    return permissionsObject;
  }

  /**
   * Convert permissions object to Map
   * @private
   */
  _objectToMap(permissions) {
    const permissionsMap = new Map();
    for (const [resource, actions] of Object.entries(permissions)) {
      permissionsMap.set(resource, {
        view: Boolean(actions.view),
        edit: Boolean(actions.edit),
        create: Boolean(actions.create),
        delete: Boolean(actions.delete),
        react: Boolean(actions.react)
      });
    }
    return permissionsMap;
  }

  /**
   * Get permissions for a specific user
   * @param {string} userId - User ID
   */
  async getUserPermissions(userId) {
    const user = await User.findById(userId);

    if (!user) {
      return notFound('User');
    }

    const permissionsObject = this._mapToObject(user.permissions);

    return success({
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: permissionsObject
    });
  }

  /**
   * Update permissions for a specific user
   * @param {string} userId - User ID
   * @param {Object} permissions - Permissions object
   */
  async updateUserPermissions(userId, permissions) {
    if (!permissions || typeof permissions !== 'object') {
      return badRequest('Invalid permissions format');
    }

    const user = await User.findById(userId);

    if (!user) {
      return notFound('User');
    }

    // Update user with new permissions
    user.permissions = this._objectToMap(permissions);
    await user.save();

    const permissionsObject = this._mapToObject(user.permissions);

    return success({
      message: 'User permissions updated successfully',
      userId: user._id,
      name: user.name,
      role: user.role,
      permissions: permissionsObject
    });
  }

  /**
   * Reset a user's permissions to the default for their role
   * @param {string} userId - User ID
   */
  async resetUserPermissions(userId) {
    const user = await User.findById(userId);

    if (!user) {
      return notFound('User');
    }

    // Get default permissions for user's role
    const defaultPermissions = getDefaultPermissions(user.role);

    // Update user with default permissions
    user.permissions = this._objectToMap(defaultPermissions);
    await user.save();

    const permissionsObject = this._mapToObject(user.permissions);

    return success({
      message: 'User permissions reset to default',
      userId: user._id,
      name: user.name,
      role: user.role,
      permissions: permissionsObject
    });
  }

  /**
   * Get users by role with their permissions
   * @param {string} role - Role name
   * @param {Object} options - Pagination options
   */
  async getUsersByRole(role, { page = 1, limit = 10 } = {}) {
    const query = role ? { role } : {};

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { name: 1 }
    };

    const users = await User.find(query)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .sort(options.sort)
      .select('name email role permissions');

    const totalUsers = await User.countDocuments(query);

    // Convert Map to plain object for each user
    const formattedUsers = users.map((user) => {
      const permissionsObject = this._mapToObject(user.permissions);

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: permissionsObject
      };
    });

    return success({
      data: formattedUsers,
      pagination: {
        total: totalUsers,
        page: options.page,
        limit: options.limit,
        pages: Math.ceil(totalUsers / options.limit)
      }
    });
  }

  /**
   * Initialize permissions for a newly created user
   * @param {string} userId - User ID
   * @returns {Promise<boolean>} Success status
   */
  async initializeUserPermissions(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        return false;
      }

      // Get default permissions for user's role
      const defaultPermissions = getDefaultPermissions(user.role);

      // Update user with default permissions
      user.permissions = this._objectToMap(defaultPermissions);
      await user.save();

      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Reset permissions for all users with a specific role
   * @param {string} role - Role name
   */
  async resetRolePermissions(role) {
    if (!role) {
      return badRequest('Role parameter is required');
    }

    if (!VALID_ROLES.includes(role)) {
      return badRequest('Invalid role specified');
    }

    // Get default permissions for the role
    const defaultPermissions = getDefaultPermissions(role);

    // Find all users with the specified role
    const users = await User.find({ role });

    if (users.length === 0) {
      return notFound(`No users found with role: ${role}`);
    }

    // Count of successfully updated users
    let successCount = 0;

    // Update each user's permissions
    for (const user of users) {
      user.permissions = this._objectToMap(defaultPermissions);
      await user.save();
      successCount++;
    }

    return success({
      message: `Successfully reset permissions for ${successCount} users with role ${role}`,
      role,
      usersUpdated: successCount,
      totalUsers: users.length,
      defaultPermissions
    });
  }

  /**
   * Set custom permissions for all users with a specific role
   * @param {string} role - Role name
   * @param {Object} permissions - Permissions object
   */
  async setRolePermissions(role, permissions) {
    if (!role) {
      return badRequest('Role parameter is required');
    }

    if (!permissions || typeof permissions !== 'object') {
      return badRequest('Invalid permissions format');
    }

    if (!VALID_ROLES.includes(role)) {
      return badRequest('Invalid role specified');
    }

    // Find all users with the specified role
    const users = await User.find({ role });

    if (users.length === 0) {
      return notFound(`No users found with role: ${role}`);
    }

    // Count of successfully updated users
    let successCount = 0;

    // Update each user's permissions
    for (const user of users) {
      user.permissions = this._objectToMap(permissions);
      await user.save();
      successCount++;
    }

    return success({
      message: `Successfully updated permissions for ${successCount} users with role ${role}`,
      role,
      usersUpdated: successCount,
      totalUsers: users.length,
      customPermissions: permissions
    });
  }
}

export const permissionService = new PermissionService();
export default permissionService;
