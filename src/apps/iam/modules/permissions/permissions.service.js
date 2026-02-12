/**
 * Permission Service
 * Contains business logic for user permission operations.
 */

import { User } from '../../../../models/index.js';
import { getDefaultPermissions } from '../../../../utils/permissions.js';
import { success, notFound, badRequest } from '../../../../services/base/index.js';

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
  _mapToObject(permissionsMap) {
    const permissionsObject = {};
    if (permissionsMap) {
      for (const [key, value] of permissionsMap.entries()) {
        permissionsObject[key] = value;
      }
    }
    return permissionsObject;
  }

  _objectToMap(permissions) {
    const permissionsMap = new Map();
    for (const [resource, actions] of Object.entries(permissions)) {
      permissionsMap.set(resource, {
        view: Boolean(actions.view),
        edit: Boolean(actions.edit),
        create: Boolean(actions.create),
        delete: Boolean(actions.delete),
        react: Boolean(actions.react),
      });
    }
    return permissionsMap;
  }

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
      permissions: permissionsObject,
    });
  }

  async updateUserPermissions(userId, permissions) {
    if (!permissions || typeof permissions !== 'object') {
      return badRequest('Invalid permissions format');
    }

    const user = await User.findById(userId);
    if (!user) {
      return notFound('User');
    }

    user.permissions = this._objectToMap(permissions);
    await user.save();

    const permissionsObject = this._mapToObject(user.permissions);

    return success({
      message: 'User permissions updated successfully',
      userId: user._id,
      name: user.name,
      role: user.role,
      permissions: permissionsObject,
    });
  }

  async resetUserPermissions(userId) {
    const user = await User.findById(userId);

    if (!user) {
      return notFound('User');
    }

    const defaultPermissions = getDefaultPermissions(user.role);
    user.permissions = this._objectToMap(defaultPermissions);
    await user.save();

    const permissionsObject = this._mapToObject(user.permissions);

    return success({
      message: 'User permissions reset to default',
      userId: user._id,
      name: user.name,
      role: user.role,
      permissions: permissionsObject,
    });
  }

  async getUsersByRole(role, { page = 1, limit = 10 } = {}) {
    const query = role ? { role } : {};

    const options = {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      sort: { name: 1 },
    };

    const users = await User.find(query)
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .sort(options.sort)
      .select('name email role permissions');

    const totalUsers = await User.countDocuments(query);

    const formattedUsers = users.map((user) => {
      const permissionsObject = this._mapToObject(user.permissions);

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: permissionsObject,
      };
    });

    return success({
      data: formattedUsers,
      pagination: {
        total: totalUsers,
        page: options.page,
        limit: options.limit,
        pages: Math.ceil(totalUsers / options.limit),
      },
    });
  }

  async initializeUserPermissions(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return false;
      }

      const defaultPermissions = getDefaultPermissions(user.role);
      user.permissions = this._objectToMap(defaultPermissions);
      await user.save();

      return true;
    } catch (err) {
      return false;
    }
  }

  async resetRolePermissions(role) {
    if (!role) {
      return badRequest('Role parameter is required');
    }
    if (!VALID_ROLES.includes(role)) {
      return badRequest('Invalid role specified');
    }

    const defaultPermissions = getDefaultPermissions(role);
    const users = await User.find({ role });

    if (users.length === 0) {
      return notFound(`No users found with role: ${role}`);
    }

    let successCount = 0;
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
      defaultPermissions,
    });
  }

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

    const users = await User.find({ role });

    if (users.length === 0) {
      return notFound(`No users found with role: ${role}`);
    }

    let successCount = 0;
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
      customPermissions: permissions,
    });
  }
}

export const permissionService = new PermissionService();
export default permissionService;

