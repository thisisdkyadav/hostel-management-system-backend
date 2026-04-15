/**
 * Super Admin Service
 * Contains all business logic for super admin operations.
 * 
 * @module services/superAdmin
 */

import { ApiClient, User, Admin, HCUStaff } from '../../../../models/index.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { success, badRequest, error, notFound, forbidden } from '../../../../services/base/index.js';
import { ROLES, SUBROLES, ADMIN_SUBROLES } from '../../../../core/constants/roles.constants.js';

const normalizeText = (value) => (typeof value === 'string' ? value.trim() : '');
const isHcuSubRole = (subRole) => subRole === SUBROLES.HCU;
const getDefaultCategoryForSubRole = (subRole) => (isHcuSubRole(subRole) ? 'HCU' : 'Admin');

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
  async upsertAdminProfileBySubRole({ userId, subRole, category }) {
    const normalizedCategory = normalizeText(category);
    const isHcu = isHcuSubRole(subRole);
    const targetModel = isHcu ? HCUStaff : Admin;
    const fallbackCategory = getDefaultCategoryForSubRole(subRole);

    await targetModel.findOneAndUpdate(
      { userId },
      {
        $set: { category: normalizedCategory || fallbackCategory },
        $setOnInsert: { userId },
      },
      { new: true, upsert: true }
    );

    if (isHcu) {
      await Admin.deleteOne({ userId });
    } else {
      await HCUStaff.deleteOne({ userId });
    }
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

    if (!normalizedName || !normalizedEmail || !normalizedPassword) {
      return badRequest('Name, email, and password are required');
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

      const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
      const newUser = new User({
        name: normalizedName,
        email: normalizedEmail,
        role: ROLES.ADMIN,
        subRole: resolvedSubRole.value,
        password: hashedPassword,
        phone: normalizeText(phone) || null,
      });
      await newUser.save();

      await this.upsertAdminProfileBySubRole({
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
      const [adminProfiles, hcuProfiles] = await Promise.all([
        Admin.find({
          userId: { $in: userIds },
        })
          .select('userId category createdAt updatedAt')
          .lean(),
        HCUStaff.find({
          userId: { $in: userIds },
        })
          .select('userId category createdAt updatedAt')
          .lean(),
      ]);

      const adminProfileByUserId = new Map(
        adminProfiles.map((profile) => [String(profile.userId), profile])
      );
      const hcuProfileByUserId = new Map(
        hcuProfiles.map((profile) => [String(profile.userId), profile])
      );

      const response = users.map((user) => {
        const userId = String(user._id);
        const adminProfile = adminProfileByUserId.get(userId);
        const hcuProfile = hcuProfileByUserId.get(userId);
        const profileMeta = isHcuSubRole(user.subRole)
          ? (hcuProfile || adminProfile)
          : (adminProfile || hcuProfile);

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

      const [existingAdminProfile, existingHcuProfile] = await Promise.all([
        Admin.findOne({ userId: adminId })
          .select('category')
          .lean(),
        HCUStaff.findOne({ userId: adminId })
          .select('category')
          .lean(),
      ]);

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
        if (!normalizedPassword) {
          return badRequest('Password cannot be empty');
        }
        userUpdate.password = await bcrypt.hash(normalizedPassword, 10);
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
      const oldProfileMeta = isHcuSubRole(effectiveSubRole)
        ? (existingHcuProfile || existingAdminProfile)
        : (existingAdminProfile || existingHcuProfile);
      const fallbackCategory = getDefaultCategoryForSubRole(effectiveSubRole);
      const categoryToPersist = normalizeText(category) || normalizeText(oldProfileMeta?.category) || fallbackCategory;

      if (effectiveSubRole) {
        await this.upsertAdminProfileBySubRole({
          userId: adminId,
          subRole: effectiveSubRole,
          category: categoryToPersist,
        });
      }

      const [updatedUser, updatedAdminProfile, updatedHcuProfile] = await Promise.all([
        User.findById(adminId)
          .select('name email phone profileImage role subRole createdAt updatedAt')
          .lean(),
        Admin.findOne({ userId: adminId })
          .select('userId category createdAt updatedAt')
          .lean(),
        HCUStaff.findOne({ userId: adminId })
          .select('userId category createdAt updatedAt')
          .lean(),
      ]);

      const profileMeta = isHcuSubRole(updatedUser?.subRole)
        ? (updatedHcuProfile || updatedAdminProfile)
        : (updatedAdminProfile || updatedHcuProfile);

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
      await Promise.all([
        Admin.findOneAndDelete({ userId: adminId }),
        HCUStaff.findOneAndDelete({ userId: adminId }),
      ]);

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
