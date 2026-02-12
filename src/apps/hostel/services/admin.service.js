/**
 * Admin Service
 * Handles admin operations with BaseService pattern
 * @module services/admin
 */

import { BaseService, success, notFound, badRequest } from '../../../services/base/index.js';
import { Warden } from '../../../models/index.js';
import { User } from '../../../models/index.js';
import bcrypt from 'bcrypt';
import { Security } from '../../../models/index.js';
import { MaintenanceStaff } from '../../../models/index.js';
import { Task } from '../../../models/index.js';
import { Complaint } from '../../../models/index.js';

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
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updatedUser = await User.findOneAndUpdate(
      { email: { $regex: new RegExp(`^${email}$`, 'i') } },
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
