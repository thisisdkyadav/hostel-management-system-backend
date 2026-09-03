/**
 * Hostel Supervisor Service
 * Contains all business logic for hostel supervisor operations.
 * 
 * @module services/hostelSupervisor
 */

import bcrypt from 'bcrypt';
import { success, notFound, badRequest, forbidden } from '../../../../services/base/index.js';
import { staffRolesOwner } from '../../../../services/user/staffRolesOwner.service.js';
import { staffRolesQueries } from '../../../../services/user/staffRolesQueries.service.js';
import { userOwner } from '../../../../services/user/userOwner.service.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { buildEffectiveAuthzForUser, extractUserAuthzOverride } from '../../../../core/authz/index.js';

const ENTITY = 'Hostel Supervisor';
const EXTENSION_RE = /^\d{2,8}$/;

const normalizeExtensionNumber = (value) => {
  if (value === undefined || value === null) return { value: undefined };
  const trimmed = String(value).trim();
  if (trimmed && !EXTENSION_RE.test(trimmed)) {
    return { error: 'Extension number must be 2 to 8 digits' };
  }
  return { value: trimmed };
};

class HostelSupervisorService {

  /**
   * Get hostel supervisor profile by user ID
   * @param {string} userId - User ID
   */
  async getHostelSupervisorProfile(userId) {
    const hostelSupervisorProfile = await staffRolesQueries.findProfileByUserIdWithHostels('HostelSupervisor', userId);

    if (!hostelSupervisorProfile) {
      return notFound(ENTITY + ' profile');
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
    const { email, password, name, phone, hostelIds, joinDate, category, extensionNumber } = supervisorData;

    if (!email || !password || !name) {
      return badRequest('Email, password, and name are required');
    }

    if (hostelIds && !Array.isArray(hostelIds)) {
      return badRequest('hostelIds must be an array');
    }

    const extension = normalizeExtensionNumber(extensionNumber);
    if (extension.error) return badRequest(extension.error);

    const existingUser = await userQueries.findUserByEmailCI(email);
    if (existingUser) {
      return badRequest('User with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const savedUser = await userOwner.createUser({
      name,
      email,
      password: hashedPassword,
      role: 'Hostel Supervisor',
      phone: phone || ''
    });

    const validHostelIds = hostelIds && hostelIds.length > 0 ? hostelIds : [];
    const status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';
    const activeHostelId = validHostelIds.length > 0 ? validHostelIds[0] : null;

    await staffRolesOwner.create('HostelSupervisor', {
      userId: savedUser._id,
      hostelIds: validHostelIds,
      activeHostelId,
      status,
      joinDate: joinDate || Date.now(),
      category: category || 'Hostel Supervisor',
      extensionNumber: extension.value ?? '',
    });

    return { success: true, statusCode: 201, message: 'Hostel Supervisor created successfully' };
  }

  /**
   * Get all hostel supervisors
   */
  async getAllHostelSupervisors() {
    const hostelSupervisors = await staffRolesQueries.listWithUser('HostelSupervisor');

    const formattedHostelSupervisors = hostelSupervisors.map((hs) => ({
      id: hs._id,
      userId: hs.userId._id,
      name: hs.userId.name,
      email: hs.userId.email,
      phone: hs.userId.phone,
      extensionNumber: hs.extensionNumber || '',
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
    const { phone, profileImage, joinDate, hostelIds, category, extensionNumber } = supervisorData;

    if (hostelIds && !Array.isArray(hostelIds)) {
      return badRequest('hostelIds must be an array');
    }

    const updateData = {};
    const userUpdateData = {};

    if (hostelIds !== undefined) {
      const validHostelIds = Array.isArray(hostelIds) ? hostelIds : [];
      updateData.hostelIds = validHostelIds;
      updateData.status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';

      const currentHS = await staffRolesQueries.findByIdSelect('HostelSupervisor', id, 'activeHostelId hostelIds', { lean: true });
      if (!currentHS) {
        return notFound(ENTITY);
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
    if (extensionNumber !== undefined) {
      const extension = normalizeExtensionNumber(extensionNumber);
      if (extension.error) return badRequest(extension.error);
      updateData.extensionNumber = extension.value;
    }

    if (Object.keys(userUpdateData).length > 0) {
      const hostelSupervisor = await staffRolesQueries.findByIdSelect('HostelSupervisor', id, 'userId');
      if (!hostelSupervisor) {
        return notFound(ENTITY);
      }
      await userOwner.updateUserById(hostelSupervisor.userId, userUpdateData);
    }

    if (Object.keys(updateData).length > 0) {
      const updatedHostelSupervisor = await staffRolesOwner.updateByIdReturnLean('HostelSupervisor', id, updateData);
      if (!updatedHostelSupervisor) {
        return notFound(ENTITY + ' during update');
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
    const deletedHostelSupervisor = await staffRolesOwner.deleteById('HostelSupervisor', id);
    if (!deletedHostelSupervisor) {
      return notFound(ENTITY);
    }

    await userOwner.deleteUserById(deletedHostelSupervisor.userId);

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

    const hostelSupervisor = await staffRolesQueries.findByUserId('HostelSupervisor', userId);

    if (!hostelSupervisor) {
      return notFound(ENTITY + ' profile for this user');
    }

    const isAssigned = hostelSupervisor.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId));

    if (!isAssigned) {
      return forbidden('Hostel Supervisor is not assigned to the specified hostel');
    }

    hostelSupervisor.activeHostelId = hostelId;
    await staffRolesOwner.persist(hostelSupervisor);

    await hostelSupervisor.populate('activeHostelId', 'name type');

    // Refresh user data in session after changing active hostel
    const user = await userQueries.findUserById(userId);
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
