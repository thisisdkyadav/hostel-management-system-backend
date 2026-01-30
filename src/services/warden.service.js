/**
 * Warden Service
 * Contains all business logic for warden operations.
 * 
 * @module services/warden
 */

import Warden from '../../models/Warden.js';
import User from '../../models/User.js';
import bcrypt from 'bcrypt';
import { BaseService, success, notFound, badRequest, forbidden } from './base/index.js';

class WardenService extends BaseService {
  constructor() {
    super(Warden, 'Warden');
  }

  /**
   * Get warden profile by user ID
   * @param {string} userId - User ID
   */
  async getWardenProfile(userId) {
    const wardenProfile = await this.model.findOne({ userId })
      .populate('userId', 'name email role phone profileImage')
      .populate('hostelIds', 'name type')
      .populate('activeHostelId', 'name type');

    if (!wardenProfile) {
      return notFound(this.entityName + ' profile');
    }

    const formattedWardenProfile = {
      ...wardenProfile.toObject(),
      hostelId: wardenProfile.activeHostelId
    };

    return success(formattedWardenProfile);
  }

  /**
   * Create a new warden
   * @param {Object} wardenData - Warden data
   */
  async createWarden(wardenData) {
    const { email, password, name, phone, hostelIds, joinDate, category } = wardenData;

    if (!email || !password || !name) {
      return badRequest('Email, password, and name are required');
    }

    if (hostelIds && !Array.isArray(hostelIds)) {
      return badRequest('hostelIds must be an array');
    }

    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (existingUser) {
      return badRequest('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'Warden',
      phone: phone || ''
    });

    const savedUser = await newUser.save();

    const validHostelIds = hostelIds && hostelIds.length > 0 ? hostelIds : [];
    const status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';
    const activeHostelId = validHostelIds.length > 0 ? validHostelIds[0] : null;

    await this.model.create({
      userId: savedUser._id,
      hostelIds: validHostelIds,
      activeHostelId,
      status,
      joinDate: joinDate || Date.now(),
      category: category || 'Warden'
    });

    return { success: true, statusCode: 201, message: 'Warden created successfully' };
  }

  /**
   * Get all wardens
   */
  async getAllWardens() {
    const wardens = await this.model.find()
      .populate('userId', 'name email phone profileImage')
      .lean();

    const formattedWardens = wardens.map((warden) => ({
      id: warden._id,
      userId: warden.userId._id,
      name: warden.userId.name,
      email: warden.userId.email,
      phone: warden.userId.phone,
      hostelIds: warden.hostelIds || [],
      activeHostelId: warden.activeHostelId || null,
      joinDate: warden.joinDate ? warden.joinDate.toISOString().split('T')[0] : null,
      profileImage: warden.userId.profileImage,
      status: warden.status || (warden.hostelIds && warden.hostelIds.length > 0 ? 'assigned' : 'unassigned'),
      category: warden.category || 'Warden'
    }));

    formattedWardens.sort((a, b) => {
      const aHasChief = a.email.toLowerCase().includes('chief');
      const bHasChief = b.email.toLowerCase().includes('chief');

      if (aHasChief && !bHasChief) return -1;
      if (!aHasChief && bHasChief) return 1;

      return a.name.localeCompare(b.name);
    });

    return success(formattedWardens);
  }

  /**
   * Update warden
   * @param {string} id - Warden ID
   * @param {Object} wardenData - Update data
   */
  async updateWarden(id, wardenData) {
    const { phone, profileImage, joinDate, hostelIds, category } = wardenData;

    if (hostelIds && !Array.isArray(hostelIds)) {
      return badRequest('hostelIds must be an array');
    }

    const updateData = {};
    const userUpdateData = {};

    if (hostelIds !== undefined) {
      const validHostelIds = Array.isArray(hostelIds) ? hostelIds : [];
      updateData.hostelIds = validHostelIds;
      updateData.status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';

      const currentWarden = await this.model.findById(id).select('activeHostelId hostelIds').lean();
      if (!currentWarden) {
        return notFound(this.entityName);
      }

      const currentActiveId = currentWarden.activeHostelId ? currentWarden.activeHostelId.toString() : null;
      const newHostelIdStrings = validHostelIds.map((hId) => hId.toString());

      if (validHostelIds.length === 0) {
        updateData.activeHostelId = null;
      } else if (!currentActiveId || (currentActiveId && !newHostelIdStrings.includes(currentActiveId))) {
        updateData.activeHostelId = validHostelIds[0];
      }
    }

    if (joinDate !== undefined) updateData.joinDate = joinDate;
    if (profileImage !== undefined) userUpdateData.profileImage = profileImage;
    if (phone !== undefined) userUpdateData.phone = phone;
    if (category !== undefined) updateData.category = category;

    if (Object.keys(userUpdateData).length > 0) {
      const warden = await this.model.findById(id).select('userId');
      if (!warden) {
        return notFound(this.entityName);
      }
      await User.findByIdAndUpdate(warden.userId, userUpdateData);
    }

    if (Object.keys(updateData).length > 0) {
      const updatedWarden = await this.model.findByIdAndUpdate(id, updateData, { new: true }).lean();
      if (!updatedWarden) {
        return notFound(this.entityName + ' during update');
      }
    } else if (Object.keys(userUpdateData).length === 0) {
      return badRequest('No update data provided');
    }

    return { success: true, statusCode: 200, message: 'Warden updated successfully' };
  }

  /**
   * Delete warden
   * @param {string} id - Warden ID
   */
  async deleteWarden(id) {
    const deletedWarden = await this.model.findByIdAndDelete(id);
    if (!deletedWarden) {
      return notFound(this.entityName);
    }

    await User.findByIdAndDelete(deletedWarden.userId);

    return { success: true, statusCode: 200, message: 'Warden deleted successfully' };
  }

  /**
   * Set active hostel for warden
   * @param {string} userId - User ID
   * @param {string} hostelId - Hostel ID
   * @param {Object} session - Session object
   */
  async setActiveHostel(userId, hostelId, session) {
    if (!hostelId) {
      return badRequest('hostelId is required in the request body');
    }

    const warden = await this.model.findOne({ userId });

    if (!warden) {
      return notFound(this.entityName + ' profile for this user');
    }

    const isAssigned = warden.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId));

    if (!isAssigned) {
      return forbidden('Warden is not assigned to the specified hostel');
    }

    warden.activeHostelId = hostelId;
    await warden.save();

    await warden.populate('activeHostelId', 'name type');

    // Refresh user data in session after changing active hostel
    const user = await User.findById(userId);
    if (user && session) {
      session.userData = {
        _id: user._id,
        email: user.email,
        role: user.role,
        permissions: Object.fromEntries(user.permissions || new Map()),
        hostel: user.hostel
      };
      await session.save();
    }

    return success({
      message: 'Active hostel updated successfully',
      activeHostel: warden.activeHostelId
    });
  }
}

export const wardenService = new WardenService();
export default wardenService;
