/**
 * Admin Service
 * Handles admin operations with BaseService pattern
 * @module services/admin
 */

import { BaseService, success, notFound, badRequest } from '../../../../services/base/index.js';
import { Warden } from '../../../../models/index.js';
import { User } from '../../../../models/index.js';
import bcrypt from 'bcrypt';
import { Security } from '../../../../models/index.js';
import { MaintenanceStaff } from '../../../../models/index.js';
import { Task } from '../../../../models/index.js';
import { Complaint } from '../../../../models/index.js';
import { Gymkhana } from '../../../../models/index.js';
import { ROLES, SUBROLES } from '../../../../core/constants/roles.constants.js';
import {
  getGlobalGymkhanaCategoryDefinitions,
  normalizeCategoryKey,
} from '../../../student-affairs/modules/events/category-definitions.utils.js';

const GYMKHANA_SUBROLES = [
  SUBROLES.GS_GYMKHANA,
  SUBROLES.PRESIDENT_GYMKHANA,
  SUBROLES.ELECTION_OFFICER,
];

const normalizeOptionalText = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

const resolveGymkhanaCategoryLookup = async () => {
  const categoryDefinitions = await getGlobalGymkhanaCategoryDefinitions();
  const categoryKeySet = new Set();
  const categoryLabelToKey = new Map();
  const categoryLabelByKey = new Map();

  for (const definition of categoryDefinitions) {
    const key = normalizeCategoryKey(definition?.key);
    if (!key) continue;

    const label = String(definition?.label || '').trim() || key;
    categoryKeySet.add(key);
    categoryLabelToKey.set(label.toLowerCase(), key);
    categoryLabelByKey.set(key, label);
  }

  return { categoryKeySet, categoryLabelToKey, categoryLabelByKey };
};

const normalizeGymkhanaCategories = (categories = [], categoryLookup) => {
  if (!Array.isArray(categories)) {
    return {
      success: false,
      message: 'Categories must be provided as an array',
    };
  }

  const normalized = [];
  const dedupe = new Set();
  const invalidCategories = [];

  for (const rawCategory of categories) {
    const rawValue =
      typeof rawCategory === 'string'
        ? rawCategory
        : String(rawCategory?.key || rawCategory?.label || '');

    const trimmed = String(rawValue || '').trim();
    if (!trimmed) continue;

    const normalizedKeyCandidate = normalizeCategoryKey(trimmed);
    let resolvedKey = null;

    if (normalizedKeyCandidate && categoryLookup.categoryKeySet.has(normalizedKeyCandidate)) {
      resolvedKey = normalizedKeyCandidate;
    }

    if (!resolvedKey) {
      resolvedKey = categoryLookup.categoryLabelToKey.get(trimmed.toLowerCase()) || null;
    }

    if (!resolvedKey) {
      invalidCategories.push(trimmed);
      continue;
    }

    if (!dedupe.has(resolvedKey)) {
      dedupe.add(resolvedKey);
      normalized.push(resolvedKey);
    }
  }

  if (invalidCategories.length > 0) {
    return {
      success: false,
      message: `Invalid Gymkhana categories: ${invalidCategories.join(', ')}`,
    };
  }

  return { success: true, value: normalized };
};

class AdminService extends BaseService {
  constructor() {
    super(User, 'Admin');
  }

  /**
   * Create a security user
   */
  async createSecurity({ email, password, name, hostelId }) {
    if (!email || !password || !name || !hostelId) {
      return badRequest('Email, password, name, and hostelId are required');
    }

    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (existingUser) {
      return badRequest('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const savedUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'Security'
    });

    const savedSecurity = await Security.create({
      userId: savedUser._id,
      hostelId
    });

    return success({
      security: {
        ...savedSecurity._doc,
        user: { name: savedUser.name, email: savedUser.email, phone: savedUser.phone }
      }
    }, 201, 'Security created successfully');
  }

  /**
   * Get all securities
   */
  async getAllSecurities() {
    const securities = await Security.find()
      .populate('userId', 'name email phone profileImage')
      .exec();

    const formattedSecurities = securities.map((security) => ({
      id: security._id,
      userId: security.userId._id,
      name: security.userId.name,
      email: security.userId.email,
      phone: security.userId.phone,
      hostelId: security.hostelId || null
    }));

    return success(formattedSecurities);
  }

  /**
   * Update a security
   */
  async updateSecurity(id, { hostelId, name }) {
    const updatedSecurity = await Security.findByIdAndUpdate(
      id,
      { hostelId: hostelId || null },
      { new: true }
    );

    if (!updatedSecurity) {
      return notFound('Security not found');
    }

    if (name !== undefined) {
      await User.findByIdAndUpdate(updatedSecurity.userId, { name });
    }

    return success(null, 200, 'Security updated successfully');
  }

  /**
   * Delete a security
   */
  async deleteSecurity(id) {
    const deletedSecurity = await Security.findByIdAndDelete(id);
    if (!deletedSecurity) {
      return notFound('Security not found');
    }

    await User.findByIdAndDelete(deletedSecurity.userId);

    return success(null, 200, 'Security deleted successfully');
  }

  /**
   * Update user password
   */
  async updateUserPassword(email, newPassword) {
    const normalizedEmail = typeof email === 'string' ? email.trim() : '';
    const normalizedPassword = typeof newPassword === 'string' ? newPassword : '';

    if (!normalizedEmail) {
      return badRequest('Email is required');
    }

    if (!normalizedPassword.trim()) {
      return badRequest('New password is required');
    }

    if (normalizedPassword.length < 6) {
      return badRequest('Password must be at least 6 characters long');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(normalizedPassword, salt);

    const updatedUser = await User.findOneAndUpdate(
      { email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } },
      { password: hashedPassword },
      { new: true }
    );

    if (!updatedUser) {
      return notFound('User not found');
    }

    return success(null, 200, 'Password updated successfully');
  }

  /**
   * Create a maintenance staff
   */
  async createMaintenanceStaff({ email, password, name, phone, category }) {
    if (!email || !password || !name || !category) {
      return badRequest('Email, password, name, and category are required');
    }

    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (existingUser) {
      return badRequest('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const savedUser = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'Maintenance Staff',
      phone: phone || null
    });

    await MaintenanceStaff.create({
      userId: savedUser._id,
      category
    });

    return success(null, 201, 'Maintenance staff created successfully');
  }

  /**
   * Create a Gymkhana user
   */
  async createGymkhana({ email, password, name, subRole, categories = [], position = '' }) {
    const normalizedEmail = normalizeOptionalText(email);
    const normalizedName = normalizeOptionalText(name);
    const normalizedPosition = normalizeOptionalText(position);

    if (!normalizedEmail || !normalizedName || !subRole) {
      return badRequest('Email, name, and subRole are required');
    }

    if (!GYMKHANA_SUBROLES.includes(subRole)) {
      return badRequest('Invalid Gymkhana subRole');
    }

    const categoryLookup = await resolveGymkhanaCategoryLookup();
    const normalizedCategories = normalizeGymkhanaCategories(categories, categoryLookup);
    if (!normalizedCategories.success) {
      return badRequest(normalizedCategories.message);
    }

    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${normalizedEmail}$`, 'i') } });
    if (existingUser) {
      return badRequest('User with this email already exists');
    }

    let hashedPassword;

    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const userPayload = {
      name: normalizedName,
      email: normalizedEmail,
      role: ROLES.GYMKHANA,
      subRole,
    };

    if (hashedPassword) {
      userPayload.password = hashedPassword;
    }

    const createdUser = await User.create(userPayload);
    try {
      await Gymkhana.create({
        userId: createdUser._id,
        categories: normalizedCategories.value,
        position: normalizedPosition,
      });
    } catch (error) {
      await User.findByIdAndDelete(createdUser._id);
      throw error;
    }

    return success(null, 201, 'Gymkhana user created successfully');
  }

  /**
   * Get all Gymkhana users
   */
  async getAllGymkhanaUsers() {
    const [gymkhanaUsers, categoryLookup] = await Promise.all([
      User.find({ role: ROLES.GYMKHANA })
        .select('name email role subRole profileImage')
        .lean(),
      resolveGymkhanaCategoryLookup(),
    ]);

    const gymkhanaProfiles = await Gymkhana.find({
      userId: { $in: gymkhanaUsers.map((user) => user._id) },
    })
      .select('userId categories position')
      .lean();

    const profileByUserId = new Map(
      gymkhanaProfiles.map((profile) => [String(profile.userId), profile])
    );

    const formattedUsers = gymkhanaUsers
      .map((user) => {
        const profile = profileByUserId.get(String(user._id));
        const categories = Array.isArray(profile?.categories) ? profile.categories : [];

        return {
          id: user._id,
          userId: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          subRole: user.subRole || null,
          profileImage: user.profileImage || null,
          categories,
          categoryLabels: categories.map((key) => categoryLookup.categoryLabelByKey.get(key) || key),
          position: normalizeOptionalText(profile?.position) || null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    return success(formattedUsers);
  }

  /**
   * Update a Gymkhana user
   */
  async updateGymkhana(id, { name, subRole, categories, position }) {
    const updateData = {};
    const profileUpdateData = {};

    if (name !== undefined) {
      const normalizedName = normalizeOptionalText(name);
      if (!normalizedName) {
        return badRequest('Name cannot be empty');
      }
      updateData.name = normalizedName;
    }

    if (subRole !== undefined) {
      if (!GYMKHANA_SUBROLES.includes(subRole)) {
        return badRequest('Invalid Gymkhana subRole');
      }
      updateData.subRole = subRole;
    }

    if (categories !== undefined) {
      const categoryLookup = await resolveGymkhanaCategoryLookup();
      const normalizedCategories = normalizeGymkhanaCategories(categories, categoryLookup);
      if (!normalizedCategories.success) {
        return badRequest(normalizedCategories.message);
      }
      profileUpdateData.categories = normalizedCategories.value;
    }

    if (position !== undefined) {
      profileUpdateData.position = normalizeOptionalText(position);
    }

    if (Object.keys(updateData).length === 0 && Object.keys(profileUpdateData).length === 0) {
      return badRequest('No update data provided');
    }

    const existingUser = await User.findOne({ _id: id, role: ROLES.GYMKHANA })
      .select('_id')
      .lean();

    if (!existingUser) {
      return notFound('Gymkhana user');
    }

    if (Object.keys(updateData).length > 0) {
      await User.updateOne({ _id: id, role: ROLES.GYMKHANA }, updateData);
    }

    if (Object.keys(profileUpdateData).length > 0) {
      await Gymkhana.findOneAndUpdate(
        { userId: id },
        {
          $set: profileUpdateData,
          $setOnInsert: { userId: id },
        },
        { new: true, upsert: true }
      );
    }

    return success(null, 200, 'Gymkhana user updated successfully');
  }

  /**
   * Delete a Gymkhana user
   */
  async deleteGymkhana(id) {
    const deletedUser = await User.findOneAndDelete({ _id: id, role: ROLES.GYMKHANA });

    if (!deletedUser) {
      return notFound('Gymkhana user');
    }

    await Gymkhana.deleteOne({ userId: deletedUser._id });

    return success(null, 200, 'Gymkhana user deleted successfully');
  }

  /**
   * Get all maintenance staff
   */
  async getAllMaintenanceStaff() {
    const maintenanceStaff = await MaintenanceStaff.find()
      .populate('userId', 'name email phone profileImage')
      .exec();

    const formattedStaff = maintenanceStaff.map((staff) => ({
      id: staff._id,
      userId: staff.userId._id,
      name: staff.userId.name,
      email: staff.userId.email,
      phone: staff.userId.phone,
      category: staff.category || null,
      profileImage: staff.userId.profileImage
    }));

    return success(formattedStaff);
  }

  /**
   * Update a maintenance staff
   */
  async updateMaintenanceStaff(id, { name, phone, profileImage, category }) {
    const updateData = {};
    if (category !== undefined) updateData.category = category;

    const updatedStaff = await MaintenanceStaff.findByIdAndUpdate(id, updateData, { new: true });

    if (!updatedStaff) {
      return notFound('Maintenance staff not found');
    }

    const updateUserData = {};
    if (name !== undefined) updateUserData.name = name;
    if (phone !== undefined) updateUserData.phone = phone;
    if (profileImage !== undefined) updateUserData.profileImage = profileImage;

    if (Object.keys(updateUserData).length > 0) {
      await User.findByIdAndUpdate(updatedStaff.userId, updateUserData);
    }

    return success(null, 200, 'Maintenance staff updated successfully');
  }

  /**
   * Delete a maintenance staff
   */
  async deleteMaintenanceStaff(id) {
    const deletedStaff = await MaintenanceStaff.findByIdAndDelete(id);
    if (!deletedStaff) {
      return notFound('Maintenance staff not found');
    }

    await User.findByIdAndDelete(deletedStaff.userId);

    return success(null, 200, 'Maintenance staff deleted successfully');
  }

  /**
   * Get task statistics
   */
  async getTaskStats() {
    const [taskStats, categoryStats, priorityStats, overdueTasks] = await Promise.all([
      Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Task.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Task.aggregate([{ $group: { _id: '$priority', count: { $sum: 1 } } }]),
      Task.countDocuments({ dueDate: { $lt: new Date() }, status: { $ne: 'Completed' } })
    ]);

    const formatStats = (arr) => arr.reduce((acc, curr) => ({ ...acc, [curr._id]: curr.count }), {});

    return success({
      statusCounts: formatStats(taskStats),
      categoryCounts: formatStats(categoryStats),
      priorityCounts: formatStats(priorityStats),
      overdueTasks
    });
  }

  /**
   * Get maintenance staff statistics
   */
  async getMaintenanceStaffStats(staffId) {
    const [totalWorkDone, todayWorkDone] = await Promise.all([
      Complaint.countDocuments({ resolvedBy: staffId }),
      Complaint.countDocuments({
        resolvedBy: staffId,
        resolvedDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      })
    ]);

    return success({ totalWorkDone, todayWorkDone });
  }
}

export const adminService = new AdminService();
export default adminService;
