/**
 * Super Admin Service
 * Contains all business logic for super admin operations.
 * 
 * @module services/superAdmin
 */

import { ApiClient, User, Admin } from '../../../../models/index.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { success, badRequest, error, notFound, forbidden } from '../../../../services/base/index.js';
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

    await Admin.findOneAndUpdate(
      { userId },
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
      const newClient = new ApiClient({ name, apiKey, expiresAt });
      await newClient.save();
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
      const clients = await ApiClient.find();
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
      await ApiClient.findByIdAndDelete(clientId);
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
      const updatedClient = await ApiClient.findByIdAndUpdate(
        clientId,
        { name, expiresAt, isActive },
        { new: true }
      );
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
      const existingUser = await User.findOne({
        email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') },
      })
        .select('_id')
        .lean();

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

      const newUser = new User(newUserPayload);
      await newUser.save();

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

      const users = await User.find(userQuery)
        .select('name email phone profileImage role subRole createdAt updatedAt')
        .sort({ name: 1 })
        .lean();

      const userIds = users.map((user) => user._id);
      const adminProfiles = await Admin.find({
        userId: { $in: userIds },
      })
        .select('userId category createdAt updatedAt')
        .lean();

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
      const existingUser = await User.findOne({ _id: adminId, role: ROLES.ADMIN }).lean();

      if (!existingUser) {
        return notFound('Admin');
      }

      if (actor?.role === ROLES.ADMIN && existingUser.subRole !== SUBROLES.HCU) {
        return forbidden('Admin can only manage HCU sub-role accounts');
      }

      const existingAdminProfile = await Admin.findOne({ userId: adminId })
        .select('category')
        .lean();

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

        const duplicateUser = await User.findOne({
          _id: { $ne: adminId },
          email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') },
        })
          .select('_id')
          .lean();

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
        await User.updateOne({ _id: adminId, role: ROLES.ADMIN }, { $set: userUpdate });
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
        User.findById(adminId)
          .select('name email phone profileImage role subRole createdAt updatedAt')
          .lean(),
        Admin.findOne({ userId: adminId })
          .select('userId category createdAt updatedAt')
          .lean(),
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
      const existingUser = await User.findOne({ _id: adminId, role: ROLES.ADMIN })
        .select('_id subRole')
        .lean();

      if (!existingUser) {
        return notFound('Admin');
      }

      if (actor?.role === ROLES.ADMIN && existingUser.subRole !== SUBROLES.HCU) {
        return forbidden('Admin can only manage HCU sub-role accounts');
      }

      await User.findByIdAndDelete(adminId);
      await Admin.findOneAndDelete({ userId: adminId });

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
      const totalAdmins = await User.countDocuments({ role: ROLES.ADMIN });
      const totalApiKeys = await ApiClient.countDocuments();
      const activeApiKeys = await ApiClient.countDocuments({ isActive: true });

      return success({ totalAdmins, totalApiKeys, activeApiKeys });
    } catch (err) {
      return error('Failed to fetch dashboard stats', 500, err);
    }
  }
}

export const superAdminService = new SuperAdminService();
