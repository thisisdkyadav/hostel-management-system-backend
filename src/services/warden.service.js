/**
 * Warden Service
 * Contains all business logic for warden operations.
 * 
 * @module services/warden
 */

import Warden from '../../models/Warden.js';
import User from '../../models/User.js';
import bcrypt from 'bcrypt';

class WardenService {
  /**
   * Get warden profile by user ID
   */
  async getWardenProfile(userId) {
    const wardenProfile = await Warden.findOne({ userId })
      .populate('userId', 'name email role phone profileImage')
      .populate('hostelIds', 'name type')
      .populate('activeHostelId', 'name type')
      .exec();

    if (!wardenProfile) {
      return { success: false, statusCode: 404, message: 'Warden profile not found' };
    }

    const formattedWardenProfile = {
      ...wardenProfile.toObject(),
      hostelId: wardenProfile.activeHostelId,
    };

    return { success: true, statusCode: 200, data: formattedWardenProfile };
  }

  /**
   * Create a new warden
   */
  async createWarden(wardenData) {
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
      role: 'Warden',
      phone: phone || '',
    });

    const savedUser = await newUser.save();

    const validHostelIds = hostelIds && hostelIds.length > 0 ? hostelIds : [];
    const status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';
    const activeHostelId = validHostelIds.length > 0 ? validHostelIds[0] : null;

    const newWarden = new Warden({
      userId: savedUser._id,
      hostelIds: validHostelIds,
      activeHostelId: activeHostelId,
      status: status,
      joinDate: joinDate || Date.now(),
      category: category || 'Warden',
    });

    await newWarden.save();

    return { success: true, statusCode: 201, message: 'Warden created successfully' };
  }

  /**
   * Get all wardens
   */
  async getAllWardens() {
    const wardens = await Warden.find()
      .populate('userId', 'name email phone profileImage')
      .lean()
      .exec();

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
      category: warden.category || 'Warden',
    }));

    formattedWardens.sort((a, b) => {
      const aHasChief = a.email.toLowerCase().includes('chief');
      const bHasChief = b.email.toLowerCase().includes('chief');

      if (aHasChief && !bHasChief) return -1;
      if (!aHasChief && bHasChief) return 1;

      return a.name.localeCompare(b.name);
    });

    return { success: true, statusCode: 200, data: formattedWardens };
  }

  /**
   * Update warden
   */
  async updateWarden(id, wardenData) {
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

      const currentWarden = await Warden.findById(id).select('activeHostelId hostelIds').lean();
      if (!currentWarden) {
        return { success: false, statusCode: 404, message: 'Warden not found' };
      }

      const currentActiveId = currentWarden.activeHostelId ? currentWarden.activeHostelId.toString() : null;
      const newHostelIdStrings = validHostelIds.map((id) => id.toString());

      console.log(validHostelIds, newHostelIdStrings);

      if (validHostelIds.length === 0) {
        updateData.activeHostelId = null;
      } else if (!currentActiveId || (currentActiveId && !newHostelIdStrings.includes(currentActiveId))) {
        updateData.activeHostelId = validHostelIds[0];
        console.log(updateData);
      }
    }

    if (joinDate !== undefined) {
      updateData.joinDate = joinDate;
    }

    if (profileImage !== undefined) {
      userUpdateData.profileImage = profileImage;
    }

    if (phone !== undefined) {
      userUpdateData.phone = phone;
    }

    if (category !== undefined) {
      updateData.category = category;
    }

    if (Object.keys(userUpdateData).length > 0) {
      const warden = await Warden.findById(id).select('userId');
      if (!warden) {
        return { success: false, statusCode: 404, message: 'Warden not found' };
      }
      await User.findByIdAndUpdate(warden.userId, userUpdateData);
    }

    if (Object.keys(updateData).length > 0) {
      const updatedWarden = await Warden.findByIdAndUpdate(id, updateData, { new: true }).lean();

      if (!updatedWarden) {
        return { success: false, statusCode: 404, message: 'Warden not found during update' };
      }
    } else if (Object.keys(userUpdateData).length === 0) {
      return { success: false, statusCode: 400, message: 'No update data provided' };
    }

    return { success: true, statusCode: 200, message: 'Warden updated successfully' };
  }

  /**
   * Delete warden
   */
  async deleteWarden(id) {
    const deletedWarden = await Warden.findByIdAndDelete(id);
    if (!deletedWarden) {
      return { success: false, statusCode: 404, message: 'Warden not found' };
    }

    await User.findByIdAndDelete(deletedWarden.userId);

    return { success: true, statusCode: 200, message: 'Warden deleted successfully' };
  }

  /**
   * Set active hostel for warden
   */
  async setActiveHostel(userId, hostelId, session) {
    if (!hostelId) {
      return { success: false, statusCode: 400, message: 'hostelId is required in the request body' };
    }

    const warden = await Warden.findOne({ userId });

    if (!warden) {
      return { success: false, statusCode: 404, message: 'Warden profile not found for this user' };
    }

    const isAssigned = warden.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId));

    if (!isAssigned) {
      return { success: false, statusCode: 403, message: 'Warden is not assigned to the specified hostel' };
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
        hostel: user.hostel,
      };
      await session.save();
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        message: 'Active hostel updated successfully',
        activeHostel: warden.activeHostelId,
      },
    };
  }
}

export const wardenService = new WardenService();
export default wardenService;
