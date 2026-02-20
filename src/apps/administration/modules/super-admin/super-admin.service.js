/**
 * Super Admin Service
 * Contains all business logic for super admin operations.
 * 
 * @module services/superAdmin
 */

import { ApiClient } from '../../../../models/index.js';
import { User } from '../../../../models/index.js';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Admin } from '../../../../models/index.js';
import { success, badRequest, error } from '../../../../services/base/index.js';

class SuperAdminService {
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
  async createAdmin(data) {
    const { name, email, password, phone, category } = data;

    if (!name || !email) {
      return badRequest('Name and email are required');
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({
        name,
        email,
        role: 'Admin',
        password: hashedPassword,
        phone
      });
      await newUser.save();

      const newAdmin = new Admin({ userId: newUser._id, category });
      await newAdmin.save();

      return success({ message: 'Admin created successfully', adminId: newAdmin._id }, 201);
    } catch (err) {
      return error('Failed to create admin', 500, err);
    }
  }

  /**
   * Get all admins
   */
  async getAdmins() {
    try {
      const admins = await Admin.find().populate('userId', 'name email phone profileImage role');
      const response = admins.map((admin) => ({
        _id: admin.userId._id,
        id: admin.userId._id,
        name: admin.userId.name,
        email: admin.userId.email,
        phone: admin.userId.phone,
        profileImage: admin.userId.profileImage,
        role: admin.userId.role,
        category: admin.category,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt
      }));
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
  async updateAdmin(adminId, data) {
    const { name, email, password, phone, category, profileImage } = data;

    try {
      const updatedUser = await User.findByIdAndUpdate(
        adminId,
        { name, email, password, phone, profileImage },
        { new: true }
      );
      const updatedAdmin = await Admin.findOneAndUpdate(
        { userId: adminId },
        { category },
        { new: true }
      );

      const response = {
        _id: updatedAdmin._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        profileImage: updatedUser.profileImage,
        role: updatedUser.role,
        category: updatedAdmin.category
      };
      return success({ message: 'Admin updated successfully', response });
    } catch (err) {
      return error('Failed to update admin', 500, err);
    }
  }

  /**
   * Delete an admin
   * @param {string} adminId - Admin user ID
   */
  async deleteAdmin(adminId) {
    try {
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
      const totalAdmins = await Admin.countDocuments();
      const totalApiKeys = await ApiClient.countDocuments();
      const activeApiKeys = await ApiClient.countDocuments({ isActive: true });

      return success({ totalAdmins, totalApiKeys, activeApiKeys });
    } catch (err) {
      return error('Failed to fetch dashboard stats', 500, err);
    }
  }
}

export const superAdminService = new SuperAdminService();
