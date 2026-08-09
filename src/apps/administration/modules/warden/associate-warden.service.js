/**
 * Associate Warden Service
 * Contains all business logic for associate warden operations.
 * 
 * @module services/associateWarden
 */

import bcrypt from 'bcrypt';
import { success, notFound, badRequest, forbidden } from '../../../../services/base/index.js';
import { staffRolesOwner } from '../../../../services/user/staffRolesOwner.service.js';
import { staffRolesQueries } from '../../../../services/user/staffRolesQueries.service.js';
import { userOwner } from '../../../../services/user/userOwner.service.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { buildEffectiveAuthzForUser, extractUserAuthzOverride } from '../../../../core/authz/index.js';

const ENTITY = 'Associate Warden';

class AssociateWardenService {

  /**
   * Get associate warden profile by user ID
   * @param {string} userId - User ID
   */
  async getAssociateWardenProfile(userId) {
    const associateWardenProfile = await staffRolesQueries.findProfileByUserIdWithHostels('AssociateWarden', userId);

    if (!associateWardenProfile) {
      return notFound(ENTITY + ' profile');
    }

    const formattedProfile = {
      ...associateWardenProfile.toObject(),
      hostelId: associateWardenProfile.activeHostelId
    };

    return success(formattedProfile);
  }

  /**
   * Create a new associate warden
   * @param {Object} wardenData - Warden data
   */
  async createAssociateWarden(wardenData) {
    const { email, password, name, phone, hostelIds, joinDate, category } = wardenData;

    if (!email || !password || !name) {
      return badRequest('Email, password, and name are required');
    }

    if (hostelIds && !Array.isArray(hostelIds)) {
      return badRequest('hostelIds must be an array');
    }

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
      role: 'Associate Warden',
      phone: phone || ''
    });

    const validHostelIds = hostelIds && hostelIds.length > 0 ? hostelIds : [];
    const status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';
    const activeHostelId = validHostelIds.length > 0 ? validHostelIds[0] : null;

    await staffRolesOwner.create('AssociateWarden', {
      userId: savedUser._id,
      hostelIds: validHostelIds,
      activeHostelId,
      status,
      joinDate: joinDate || Date.now(),
      category: category || 'Associate Warden'
    });

    return { success: true, statusCode: 201, message: 'Associate Warden created successfully' };
  }

  /**
   * Get all associate wardens
   */
  async getAllAssociateWardens() {
    const associateWardens = await staffRolesQueries.listWithUser('AssociateWarden');

    const formattedAssociateWardens = associateWardens.map((aw) => ({
      id: aw._id,
      userId: aw.userId._id,
      name: aw.userId.name,
      email: aw.userId.email,
      phone: aw.userId.phone,
      hostelIds: aw.hostelIds || [],
      activeHostelId: aw.activeHostelId || null,
      joinDate: aw.joinDate ? aw.joinDate.toISOString().split('T')[0] : null,
      profileImage: aw.userId.profileImage,
      status: aw.status || (aw.hostelIds && aw.hostelIds.length > 0 ? 'assigned' : 'unassigned'),
      category: aw.category || 'Associate Warden'
    }));

    formattedAssociateWardens.sort((a, b) => {
      const aHasChief = a.email.toLowerCase().includes('chief');
      const bHasChief = b.email.toLowerCase().includes('chief');

      if (aHasChief && !bHasChief) return -1;
      if (!aHasChief && bHasChief) return 1;

      return a.name.localeCompare(b.name);
    });

    return success(formattedAssociateWardens);
  }

  /**
   * Update associate warden
   * @param {string} id - Associate Warden ID
   * @param {Object} wardenData - Update data
   */
  async updateAssociateWarden(id, wardenData) {
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

      const currentAW = await staffRolesQueries.findByIdSelect('AssociateWarden', id, 'activeHostelId hostelIds', { lean: true });
      if (!currentAW) {
        return notFound(ENTITY);
      }

      const currentActiveId = currentAW.activeHostelId ? currentAW.activeHostelId.toString() : null;
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
    if (phone !== undefined) userUpdateData.phone = phone;
    if (profileImage !== undefined) userUpdateData.profileImage = profileImage;
    if (category !== undefined) updateData.category = category;

    if (Object.keys(userUpdateData).length > 0) {
      const associateWarden = await staffRolesQueries.findByIdSelect('AssociateWarden', id, 'userId');
      if (!associateWarden) {
        return notFound(ENTITY);
      }
      await userOwner.updateUserById(associateWarden.userId, userUpdateData);
    }

    if (Object.keys(updateData).length > 0) {
      const updatedAssociateWarden = await staffRolesOwner.updateByIdReturnLean('AssociateWarden', id, updateData);
      if (!updatedAssociateWarden) {
        return notFound(ENTITY + ' during update');
      }
    } else if (Object.keys(userUpdateData).length === 0) {
      return badRequest('No update data provided');
    }

    return { success: true, statusCode: 200, message: 'Associate Warden updated successfully' };
  }

  /**
   * Delete associate warden
   * @param {string} id - Associate Warden ID
   */
  async deleteAssociateWarden(id) {
    const deletedAssociateWarden = await staffRolesOwner.deleteById('AssociateWarden', id);
    if (!deletedAssociateWarden) {
      return notFound(ENTITY);
    }

    await userOwner.deleteUserById(deletedAssociateWarden.userId);

    return { success: true, statusCode: 200, message: 'Associate Warden deleted successfully' };
  }

  /**
   * Set active hostel for associate warden
   * @param {string} userId - User ID
   * @param {string} hostelId - Hostel ID
   * @param {Object} session - Session object
   */
  async setActiveHostelAW(userId, hostelId, session) {
    if (!hostelId) {
      return badRequest('hostelId is required in the request body');
    }

    const associateWarden = await staffRolesQueries.findByUserId('AssociateWarden', userId);

    if (!associateWarden) {
      return notFound(ENTITY + ' profile for this user');
    }

    const isAssigned = associateWarden.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId));

    if (!isAssigned) {
      return forbidden('Associate Warden is not assigned to the specified hostel');
    }

    associateWarden.activeHostelId = hostelId;
    await staffRolesOwner.persist(associateWarden);

    await associateWarden.populate('activeHostelId', 'name type');

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
      message: 'Active hostel updated successfully for Associate Warden',
      activeHostel: associateWarden.activeHostelId
    });
  }
}

export const associateWardenService = new AssociateWardenService();
export default associateWardenService;
