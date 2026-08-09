/**
 * Super Admin Service
 * Contains all business logic for super admin operations.
 * 
 * @module services/superAdmin
 */

import { userOwner } from '../../../../services/user/userOwner.service.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { staffRolesOwner } from '../../../../services/user/staffRolesOwner.service.js';
import { staffRolesQueries } from '../../../../services/user/staffRolesQueries.service.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { success, badRequest, error, notFound, forbidden } from '../../../../services/base/index.js';
import { scannerOwner } from '../../../../services/scanner/scannerOwner.service.js';
import { scannerQueries } from '../../../../services/scanner/scannerQueries.service.js';
import { ROLES, SUBROLES, ADMIN_SUBROLES } from '../../../../core/constants/roles.constants.js';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');
const getDefaultCategoryForSubRole = (subRole) => (subRole === SUBROLES.HCU ? 'HCU' : 'Admin');

const resolveRequestedAdminSubRole = ({ requestedSubRole, actorRole }) => {
  const normalizedRequestedSubRole = normalizeText(requestedSubRole);

  if (actorRole === ROLES.ADMIN) {
    if (normalizedRequestedSubRole && normalizedRequestedSubRole !== SUBROLES.HCU) {
      return {
        success: false,
        status: 'forbidden',
        message: 'Admin can only manage HCU sub-role accounts',
      };
    }

    return {
      success: true,
      value: SUBROLES.HCU,
    };
  }

  if (!normalizedRequestedSubRole) {
    return {
      success: false,
      status: 'badRequest',
      message: 'subRole is required',
    };
  }

  if (!ADMIN_SUBROLES.includes(normalizedRequestedSubRole)) {
    return {
      success: false,
      status: 'badRequest',
      message: 'Invalid admin subRole',
    };
  }

  return {
    success: true,
    value: normalizedRequestedSubRole,
  };
};

const buildUserResponse = ({ user, profileMeta }) => ({
  _id: user._id,
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  profileImage: user.profileImage || '',
  role: user.role,
  subRole: user.subRole || null,
  category: profileMeta?.category || null,
  createdAt: profileMeta?.createdAt || user.createdAt,
  updatedAt: profileMeta?.updatedAt || user.updatedAt,
});

class SuperAdminService {
  async upsertAdminProfile({ userId, subRole, category }) {
    const normalizedCategory = normalizeText(category);
    const fallbackCategory = getDefaultCategoryForSubRole(subRole);

    await staffRolesOwner.findOneAndUpdateByUserId(
      'Admin',
      userId,
      {
        $set: { category: normalizedCategory || fallbackCategory },
        $setOnInsert: { userId },
      },
      { new: true, upsert: true }
    );
  }

  /**
   * Create an API client
   * @param {Object} data - API client data
   */
  async createApiClient(data) {
    const { name, expiresAt } = data;

    if (!name) {
      return badRequest('Name is required');
    }

    try {
      const apiKey = crypto.randomBytes(32).toString('hex');
      const newClient = await scannerOwner.createApiClient({ name, apiKey, expiresAt });
      return success({ message: 'API client created successfully', clientId: newClient._id, apiKey }, 201);
    } catch (err) {
      if (err.code === 11000) {
        return { success: false, statusCode: 409, message: 'API client with this name already exists' };
      }
      return error('Failed to create API client', 500, err);
    }
  }

  /**
   * Get all API clients
   */
  async getApiClients() {
    try {
      const clients = await scannerQueries.listApiClients();
      return success(clients);
    } catch (err) {
      return error('Failed to fetch API clients', 500, err);
    }
  }

  /**
   * Delete an API client
   * @param {string} clientId - Client ID
   */
  async deleteApiClient(clientId) {
    try {
      await scannerOwner.deleteApiClientById(clientId);
      return success({ message: 'API client deleted successfully' });
    } catch (err) {
      return error('Failed to delete API client', 500, err);
    }
  }

  /**
   * Update an API client
   * @param {string} clientId - Client ID
   * @param {Object} data - Update data
   */
  async updateApiClient(clientId, data) {
    const { name, expiresAt, isActive } = data;
    try {
      const updatedClient = await scannerOwner.updateApiClientById(clientId, { name, expiresAt, isActive });
      return success({ message: 'API client updated successfully', updatedClient });
    } catch (err) {
      return error('Failed to update API client', 500, err);
    }
  }

  /**
   * Create an admin user
   * @param {Object} data - Admin data
   */
  async createAdmin(data, actor = {}) {
    const { name, email, password, phone, category, subRole } = data;
    const normalizedName = normalizeText(name);
    const normalizedEmail = normalizeText(email);
    const normalizedPassword = typeof password === 'string' ? password.trim() : '';

    if (!normalizedName || !normalizedEmail) {
      return badRequest('Name and email are required');
    }

    const resolvedSubRole = resolveRequestedAdminSubRole({
      requestedSubRole: subRole,
      actorRole: actor?.role,
    });

    if (!resolvedSubRole.success) {
      return resolvedSubRole.status === 'forbidden'
        ? forbidden(resolvedSubRole.message)
        : badRequest(resolvedSubRole.message);
    }

    try {
      const existingUser = await userQueries.findUserByEmailCI(normalizedEmail, { select: '_id', lean: true });

      if (existingUser) {
        return badRequest('User with this email already exists');
      }

      const newUserPayload = {
        name: normalizedName,
        email: normalizedEmail,
        role: ROLES.ADMIN,
        subRole: resolvedSubRole.value,
        phone: normalizeText(phone) || null,
      };

      if (normalizedPassword) {
        newUserPayload.password = await bcrypt.hash(normalizedPassword, 10);
      }

      const newUser = await userOwner.createUser(newUserPayload);

      await this.upsertAdminProfile({
        userId: newUser._id,
        subRole: resolvedSubRole.value,
        category,
      });

      return success({ message: 'Admin created successfully', adminId: newUser._id }, 201);
    } catch (err) {
      return error('Failed to create admin', 500, err);
    }
  }

  /**
   * Get all admins
   */
  async getAdmins(actor = {}) {
    try {
      const userQuery = { role: ROLES.ADMIN };
      if (actor?.role === ROLES.ADMIN) {
        userQuery.subRole = SUBROLES.HCU;
      }

      const users = await userQueries.findUsers(userQuery, {
        select: 'name email phone profileImage role subRole createdAt updatedAt',
        sort: { name: 1 },
        lean: true,
      });

      const userIds = users.map((user) => user._id);
      const adminProfiles = await staffRolesQueries.findByUserIds('Admin', userIds, {
        select: 'userId category createdAt updatedAt',
        lean: true,
      });

      const adminProfileByUserId = new Map(
        adminProfiles.map((profile) => [String(profile.userId), profile])
      );

      const response = users.map((user) => {
        const userId = String(user._id);
        const adminProfile = adminProfileByUserId.get(userId) || null;
        const fallbackCategory = getDefaultCategoryForSubRole(user.subRole);
        const profileMeta = adminProfile
          ? adminProfile
          : { category: fallbackCategory, createdAt: user.createdAt, updatedAt: user.updatedAt };

        return buildUserResponse({
          user,
          profileMeta,
        });
      });

      return success(response);
    } catch (err) {
      return error('Failed to fetch admins', 500, err);
    }
  }

  /**
   * Update an admin
   * @param {string} adminId - Admin user ID
   * @param {Object} data - Update data
   */
  async updateAdmin(adminId, data, actor = {}) {
    const { name, email, password, phone, category, profileImage, subRole } = data;

    try {
      const existingUser = await userQueries.findOneUser({ _id: adminId, role: ROLES.ADMIN }, { lean: true });

      if (!existingUser) {
        return notFound('Admin');
      }

      if (actor?.role === ROLES.ADMIN && existingUser.subRole !== SUBROLES.HCU) {
        return forbidden('Admin can only manage HCU sub-role accounts');
      }

      const existingAdminProfile = await staffRolesQueries.findByUserId('Admin', adminId, { select: 'category', lean: true });

      const userUpdate = {};

      if (name !== undefined) {
        const normalizedName = normalizeText(name);
        if (!normalizedName) {
          return badRequest('Name cannot be empty');
        }
        userUpdate.name = normalizedName;
      }

      if (email !== undefined) {
        const normalizedEmail = normalizeText(email);
        if (!normalizedEmail) {
          return badRequest('Email cannot be empty');
        }

        const duplicateUser = await userQueries.findOneUser({
          _id: { $ne: adminId },
          email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') },
        }, { select: '_id', lean: true });

        if (duplicateUser) {
          return badRequest('User with this email already exists');
        }

        userUpdate.email = normalizedEmail;
      }

      if (phone !== undefined) {
        userUpdate.phone = normalizeText(phone) || null;
      }

      if (profileImage !== undefined) {
        userUpdate.profileImage = profileImage || null;
      }

      if (password !== undefined) {
        const normalizedPassword = typeof password === 'string' ? password.trim() : '';
        if (normalizedPassword) {
          userUpdate.password = await bcrypt.hash(normalizedPassword, 10);
        }
      }

      if (subRole !== undefined) {
        const resolvedSubRole = resolveRequestedAdminSubRole({
          requestedSubRole: subRole,
          actorRole: actor?.role,
        });

        if (!resolvedSubRole.success) {
          return resolvedSubRole.status === 'forbidden'
            ? forbidden(resolvedSubRole.message)
            : badRequest(resolvedSubRole.message);
        }

        userUpdate.subRole = resolvedSubRole.value;
      } else if (actor?.role === ROLES.ADMIN) {
        // Admin-side updates are always HCU scoped.
        userUpdate.subRole = SUBROLES.HCU;
      }

      if (Object.keys(userUpdate).length > 0) {
        await userOwner.updateOneUser({ _id: adminId, role: ROLES.ADMIN }, { $set: userUpdate });
      }

      const effectiveSubRole = userUpdate.subRole || existingUser.subRole;
      const oldProfileMeta = existingAdminProfile || null;
      const fallbackCategory = getDefaultCategoryForSubRole(effectiveSubRole);
      const categoryToPersist = normalizeText(category) || normalizeText(oldProfileMeta?.category) || fallbackCategory;

      if (effectiveSubRole) {
        await this.upsertAdminProfile({
          userId: adminId,
          subRole: effectiveSubRole,
          category: categoryToPersist,
        });
      }

      const [updatedUser, updatedAdminProfile] = await Promise.all([
        userQueries.findUserById(adminId, {
          select: 'name email phone profileImage role subRole createdAt updatedAt',
          lean: true,
        }),
        staffRolesQueries.findByUserId('Admin', adminId, {
          select: 'userId category createdAt updatedAt',
          lean: true,
        }),
      ]);

      const fallbackUpdatedCategory = getDefaultCategoryForSubRole(updatedUser?.subRole);
      const profileMeta = updatedAdminProfile || {
        category: fallbackUpdatedCategory,
        createdAt: updatedUser?.createdAt,
        updatedAt: updatedUser?.updatedAt,
      };

      const response = buildUserResponse({
        user: updatedUser,
        profileMeta,
      });

      return success({ message: 'Admin updated successfully', response });
    } catch (err) {
      return error('Failed to update admin', 500, err);
    }
  }

  /**
   * Delete an admin
   * @param {string} adminId - Admin user ID
   */
  async deleteAdmin(adminId, actor = {}) {
    try {
      const existingUser = await userQueries.findOneUser({ _id: adminId, role: ROLES.ADMIN }, { select: '_id subRole', lean: true });

      if (!existingUser) {
        return notFound('Admin');
      }

      if (actor?.role === ROLES.ADMIN && existingUser.subRole !== SUBROLES.HCU) {
        return forbidden('Admin can only manage HCU sub-role accounts');
      }

      await userOwner.deleteUserById(adminId);
      await staffRolesOwner.findOneAndDeleteByUserId('Admin', adminId);

      return success({ message: 'Admin deleted successfully' });
    } catch (err) {
      return error('Failed to delete admin', 500, err);
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats() {
    try {
      const totalAdmins = await userQueries.countUsers({ role: ROLES.ADMIN });
      const totalApiKeys = await scannerQueries.countApiClients();
      const activeApiKeys = await scannerQueries.countApiClients({ isActive: true });

      return success({ totalAdmins, totalApiKeys, activeApiKeys });
    } catch (err) {
      return error('Failed to fetch dashboard stats', 500, err);
    }
  }
}

export const superAdminService = new SuperAdminService();
