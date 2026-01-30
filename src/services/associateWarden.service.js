/**
 * Associate Warden Service
 * Contains all business logic for associate warden operations.
 * 
 * @module services/associateWarden
 */

import AssociateWarden from '../../models/AssociateWarden.js';
import User from '../../models/User.js';
import bcrypt from 'bcrypt';

class AssociateWardenService {
  /**
   * Get associate warden profile by user ID
   */
  async getAssociateWardenProfile(userId) {
    const associateWardenProfile = await AssociateWarden.findOne({ userId })
      .populate('userId', 'name email role phone profileImage')
      .populate('hostelIds', 'name type')
      .populate('activeHostelId', 'name type')
      .exec();

    if (!associateWardenProfile) {
      return { success: false, statusCode: 404, message: 'Associate Warden profile not found' };
    }

    const formattedProfile = {
      ...associateWardenProfile.toObject(),
      hostelId: associateWardenProfile.activeHostelId,
    };

    return { success: true, statusCode: 200, data: formattedProfile };
  }

  /**
   * Create a new associate warden
   */
  async createAssociateWarden(wardenData) {
    const { email, password, name, phone, hostelIds, joinDate, category } = wardenData;

    if (!email || !password || !name) {
      return { success: false, statusCode: 400, message: 'Email, password, and name are required' };
    }

    if (hostelIds && !Array.isArray(hostelIds)) {
      return { success: false, statusCode: 400, message: 'hostelIds must be an array' };
    }

    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (existingUser) {
      return { success: false, statusCode: 400, message: 'User with this email already exists' };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'Associate Warden',
      phone: phone || '',
    });

    const savedUser = await newUser.save();

    const validHostelIds = hostelIds && hostelIds.length > 0 ? hostelIds : [];
    const status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';
    const activeHostelId = validHostelIds.length > 0 ? validHostelIds[0] : null;

    const newAssociateWarden = new AssociateWarden({
      userId: savedUser._id,
      hostelIds: validHostelIds,
      activeHostelId: activeHostelId,
      status: status,
      joinDate: joinDate || Date.now(),
      category: category || 'Associate Warden',
    });

    await newAssociateWarden.save();

    return { success: true, statusCode: 201, message: 'Associate Warden created successfully' };
  }

  /**
   * Get all associate wardens
   */
  async getAllAssociateWardens() {
    const associateWardens = await AssociateWarden.find()
      .populate('userId', 'name email phone profileImage')
      .lean()
      .exec();

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
      category: aw.category || 'Associate Warden',
    }));

    formattedAssociateWardens.sort((a, b) => {
      const aHasChief = a.email.toLowerCase().includes('chief');
      const bHasChief = b.email.toLowerCase().includes('chief');

      if (aHasChief && !bHasChief) return -1;
      if (!aHasChief && bHasChief) return 1;

      return a.name.localeCompare(b.name);
    });

    return { success: true, statusCode: 200, data: formattedAssociateWardens };
  }

  /**
   * Update associate warden
   */
  async updateAssociateWarden(id, wardenData) {
    const { phone, profileImage, joinDate, hostelIds, category } = wardenData;

    if (hostelIds && !Array.isArray(hostelIds)) {
      return { success: false, statusCode: 400, message: 'hostelIds must be an array' };
    }

    const updateData = {};
    let userUpdateData = {};

    if (hostelIds !== undefined) {
      const validHostelIds = Array.isArray(hostelIds) ? hostelIds : [];
      updateData.hostelIds = validHostelIds;
      updateData.status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';

      const currentAW = await AssociateWarden.findById(id).select('activeHostelId hostelIds').lean();
      if (!currentAW) {
        return { success: false, statusCode: 404, message: 'Associate Warden not found' };
      }

      const currentActiveId = currentAW.activeHostelId ? currentAW.activeHostelId.toString() : null;
      const newHostelIdStrings = validHostelIds.map((id) => id.toString());

      if (validHostelIds.length === 0) {
        updateData.activeHostelId = null;
      } else if (currentActiveId && !newHostelIdStrings.includes(currentActiveId)) {
        updateData.activeHostelId = validHostelIds[0];
      } else if (!currentActiveId && validHostelIds.length > 0) {
        updateData.activeHostelId = validHostelIds[0];
      }
    }

    if (joinDate !== undefined) {
      updateData.joinDate = joinDate;
    }

    if (phone !== undefined) {
      userUpdateData.phone = phone;
    }

    if (profileImage !== undefined) {
      userUpdateData.profileImage = profileImage;
    }

    if (category !== undefined) {
      updateData.category = category;
    }

    if (Object.keys(userUpdateData).length > 0) {
      const associateWarden = await AssociateWarden.findById(id).select('userId');
      if (!associateWarden) {
        return { success: false, statusCode: 404, message: 'Associate Warden not found' };
      }
      await User.findByIdAndUpdate(associateWarden.userId, userUpdateData);
    }

    if (Object.keys(updateData).length > 0) {
      const updatedAssociateWarden = await AssociateWarden.findByIdAndUpdate(id, updateData, { new: true }).lean();
      if (!updatedAssociateWarden) {
        return { success: false, statusCode: 404, message: 'Associate Warden not found during update' };
      }
    } else if (Object.keys(userUpdateData).length === 0) {
      return { success: false, statusCode: 400, message: 'No update data provided' };
    }

    return { success: true, statusCode: 200, message: 'Associate Warden updated successfully' };
  }

  /**
   * Delete associate warden
   */
  async deleteAssociateWarden(id) {
    const deletedAssociateWarden = await AssociateWarden.findByIdAndDelete(id);
    if (!deletedAssociateWarden) {
      return { success: false, statusCode: 404, message: 'Associate Warden not found' };
    }

    await User.findByIdAndDelete(deletedAssociateWarden.userId);

    return { success: true, statusCode: 200, message: 'Associate Warden deleted successfully' };
  }

  /**
   * Set active hostel for associate warden
   */
  async setActiveHostelAW(userId, hostelId, session) {
    if (!hostelId) {
      return { success: false, statusCode: 400, message: 'hostelId is required in the request body' };
    }

    const associateWarden = await AssociateWarden.findOne({ userId });

    if (!associateWarden) {
      return { success: false, statusCode: 404, message: 'Associate Warden profile not found for this user' };
    }

    const isAssigned = associateWarden.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId));

    if (!isAssigned) {
      return { success: false, statusCode: 403, message: 'Associate Warden is not assigned to the specified hostel' };
    }

    associateWarden.activeHostelId = hostelId;
    await associateWarden.save();

    await associateWarden.populate('activeHostelId', 'name type');

    // Refresh user data in session after changing active hostel
    const user = await User.findById(userId);
    if (user && session) {
      session.userData = {
        _id: user._id,
        email: user.email,
        role: user.role,
        permissions: Object.fromEntries(user.permissions || new Map()),
        hostel: user.hostel,
      };
      await session.save();
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        message: 'Active hostel updated successfully for Associate Warden',
        activeHostel: associateWarden.activeHostelId,
      },
    };
  }
}

export const associateWardenService = new AssociateWardenService();
export default associateWardenService;
