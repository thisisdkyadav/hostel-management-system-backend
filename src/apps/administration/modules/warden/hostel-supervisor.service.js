/**
 * Hostel Supervisor Service
 * Contains all business logic for hostel supervisor operations.
 * 
 * @module services/hostelSupervisor
 */

import { HostelSupervisor } from '../../../../models/index.js';
import { User } from '../../../../models/index.js';
import bcrypt from 'bcrypt';
import { BaseService, success, notFound, badRequest, forbidden } from '../../../../services/base/index.js';
import { buildEffectiveAuthzForUser, extractUserAuthzOverride } from '../../../../core/authz/index.js';

class HostelSupervisorService extends BaseService {
  constructor() {
    super(HostelSupervisor, 'Hostel Supervisor');
  }

  /**
   * Get hostel supervisor profile by user ID
   * @param {string} userId - User ID
   */
  async getHostelSupervisorProfile(userId) {
    const hostelSupervisorProfile = await this.model.findOne({ userId })
      .populate('userId', 'name email role phone profileImage')
      .populate('hostelIds', 'name type')
      .populate('activeHostelId', 'name type');

    if (!hostelSupervisorProfile) {
      return notFound(this.entityName + ' profile');
    }

    const formattedProfile = {
      ...hostelSupervisorProfile.toObject(),
      hostelId: hostelSupervisorProfile.activeHostelId
    };

    return success(formattedProfile);
  }

  /**
   * Create a new hostel supervisor
   * @param {Object} supervisorData - Supervisor data
   */
  async createHostelSupervisor(supervisorData) {
    const { email, password, name, phone, hostelIds, joinDate, category } = supervisorData;

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
      role: 'Hostel Supervisor',
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
      category: category || 'Hostel Supervisor'
    });

    return { success: true, statusCode: 201, message: 'Hostel Supervisor created successfully' };
  }

  /**
   * Get all hostel supervisors
   */
  async getAllHostelSupervisors() {
    const hostelSupervisors = await this.model.find()
      .populate('userId', 'name email phone profileImage')
      .lean();

    const formattedHostelSupervisors = hostelSupervisors.map((hs) => ({
      id: hs._id,
      userId: hs.userId._id,
      name: hs.userId.name,
      email: hs.userId.email,
      phone: hs.userId.phone,
      hostelIds: hs.hostelIds || [],
      activeHostelId: hs.activeHostelId || null,
      joinDate: hs.joinDate ? hs.joinDate.toISOString().split('T')[0] : null,
      profileImage: hs.userId.profileImage,
      status: hs.status || (hs.hostelIds && hs.hostelIds.length > 0 ? 'assigned' : 'unassigned'),
      category: hs.category || 'Hostel Supervisor'
    }));

    formattedHostelSupervisors.sort((a, b) => {
      const aHasChief = a.email.toLowerCase().includes('chief');
      const bHasChief = b.email.toLowerCase().includes('chief');

      if (aHasChief && !bHasChief) return -1;
      if (!aHasChief && bHasChief) return 1;

      return a.name.localeCompare(b.name);
    });

    return success(formattedHostelSupervisors);
  }

  /**
   * Update hostel supervisor
   * @param {string} id - Hostel Supervisor ID
   * @param {Object} supervisorData - Update data
   */
  async updateHostelSupervisor(id, supervisorData) {
    const { phone, profileImage, joinDate, hostelIds, category } = supervisorData;

    if (hostelIds && !Array.isArray(hostelIds)) {
      return badRequest('hostelIds must be an array');
    }

    const updateData = {};
    const userUpdateData = {};

    if (hostelIds !== undefined) {
      const validHostelIds = Array.isArray(hostelIds) ? hostelIds : [];
      updateData.hostelIds = validHostelIds;
      updateData.status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';

      const currentHS = await this.model.findById(id).select('activeHostelId hostelIds').lean();
      if (!currentHS) {
        return notFound(this.entityName);
      }

      const currentActiveId = currentHS.activeHostelId ? currentHS.activeHostelId.toString() : null;
      const newHostelIdStrings = validHostelIds.map((hId) => hId.toString());

      if (validHostelIds.length === 0) {
        updateData.activeHostelId = null;
      } else if (currentActiveId && !newHostelIdStrings.includes(currentActiveId)) {
        updateData.activeHostelId = validHostelIds[0];
      } else if (!currentActiveId && validHostelIds.length > 0) {
        updateData.activeHostelId = validHostelIds[0];
      }
    }

    if (joinDate !== undefined) updateData.joinDate = joinDate;
    if (profileImage !== undefined) userUpdateData.profileImage = profileImage;
    if (phone !== undefined) userUpdateData.phone = phone;
    if (category !== undefined) updateData.category = category;

    if (Object.keys(userUpdateData).length > 0) {
      const hostelSupervisor = await this.model.findById(id).select('userId');
      if (!hostelSupervisor) {
        return notFound(this.entityName);
      }
      await User.findByIdAndUpdate(hostelSupervisor.userId, userUpdateData);
    }

    if (Object.keys(updateData).length > 0) {
      const updatedHostelSupervisor = await this.model.findByIdAndUpdate(id, updateData, { new: true }).lean();
      if (!updatedHostelSupervisor) {
        return notFound(this.entityName + ' during update');
      }
    } else if (Object.keys(userUpdateData).length === 0) {
      return badRequest('No update data provided');
    }

    return { success: true, statusCode: 200, message: 'Hostel Supervisor updated successfully' };
  }

  /**
   * Delete hostel supervisor
   * @param {string} id - Hostel Supervisor ID
   */
  async deleteHostelSupervisor(id) {
    const deletedHostelSupervisor = await this.model.findByIdAndDelete(id);
    if (!deletedHostelSupervisor) {
      return notFound(this.entityName);
    }

    await User.findByIdAndDelete(deletedHostelSupervisor.userId);

    return { success: true, statusCode: 200, message: 'Hostel Supervisor deleted successfully' };
  }

  /**
   * Set active hostel for hostel supervisor
   * @param {string} userId - User ID
   * @param {string} hostelId - Hostel ID
   * @param {Object} session - Session object
   */
  async setActiveHostelHS(userId, hostelId, session) {
    if (!hostelId) {
      return badRequest('hostelId is required in the request body');
    }

    const hostelSupervisor = await this.model.findOne({ userId });

    if (!hostelSupervisor) {
      return notFound(this.entityName + ' profile for this user');
    }

    const isAssigned = hostelSupervisor.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId));

    if (!isAssigned) {
      return forbidden('Hostel Supervisor is not assigned to the specified hostel');
    }

    hostelSupervisor.activeHostelId = hostelId;
    await hostelSupervisor.save();

    await hostelSupervisor.populate('activeHostelId', 'name type');

    // Refresh user data in session after changing active hostel
    const user = await User.findById(userId);
    if (user && session) {
      const authzOverride = extractUserAuthzOverride(user);
      const authzEffective = buildEffectiveAuthzForUser({ role: user.role, authz: { override: authzOverride } });

      session.userData = {
        _id: user._id,
        email: user.email,
        role: user.role,
        subRole: user.subRole,
        authz: {
          override: authzOverride,
          effective: authzEffective,
        },
        hostel: user.hostel,
        pinnedTabs: Array.isArray(user.pinnedTabs) ? user.pinnedTabs : [],
      };
      await session.save();
    }

    return success({
      message: 'Active hostel updated successfully for Hostel Supervisor',
      activeHostel: hostelSupervisor.activeHostelId
    });
  }
}

export const hostelSupervisorService = new HostelSupervisorService();
export default hostelSupervisorService;
