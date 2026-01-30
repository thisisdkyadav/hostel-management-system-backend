/**
 * Hostel Supervisor Service
 * Contains all business logic for hostel supervisor operations.
 * 
 * @module services/hostelSupervisor
 */

import HostelSupervisor from '../../models/HostelSupervisor.js';
import User from '../../models/User.js';
import bcrypt from 'bcrypt';

class HostelSupervisorService {
  /**
   * Get hostel supervisor profile by user ID
   */
  async getHostelSupervisorProfile(userId) {
    const hostelSupervisorProfile = await HostelSupervisor.findOne({ userId })
      .populate('userId', 'name email role phone profileImage')
      .populate('hostelIds', 'name type')
      .populate('activeHostelId', 'name type')
      .exec();

    if (!hostelSupervisorProfile) {
      return { success: false, statusCode: 404, message: 'Hostel Supervisor profile not found' };
    }

    const formattedProfile = {
      ...hostelSupervisorProfile.toObject(),
      hostelId: hostelSupervisorProfile.activeHostelId,
    };

    return { success: true, statusCode: 200, data: formattedProfile };
  }

  /**
   * Create a new hostel supervisor
   */
  async createHostelSupervisor(supervisorData) {
    const { email, password, name, phone, hostelIds, joinDate, category } = supervisorData;

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
      role: 'Hostel Supervisor',
      phone: phone || '',
    });

    const savedUser = await newUser.save();

    const validHostelIds = hostelIds && hostelIds.length > 0 ? hostelIds : [];
    const status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';
    const activeHostelId = validHostelIds.length > 0 ? validHostelIds[0] : null;

    const newHostelSupervisor = new HostelSupervisor({
      userId: savedUser._id,
      hostelIds: validHostelIds,
      activeHostelId: activeHostelId,
      status: status,
      joinDate: joinDate || Date.now(),
      category: category || 'Hostel Supervisor',
    });

    await newHostelSupervisor.save();

    return { success: true, statusCode: 201, message: 'Hostel Supervisor created successfully' };
  }

  /**
   * Get all hostel supervisors
   */
  async getAllHostelSupervisors() {
    const hostelSupervisors = await HostelSupervisor.find()
      .populate('userId', 'name email phone profileImage')
      .lean()
      .exec();

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
      category: hs.category || 'Hostel Supervisor',
    }));

    formattedHostelSupervisors.sort((a, b) => {
      const aHasChief = a.email.toLowerCase().includes('chief');
      const bHasChief = b.email.toLowerCase().includes('chief');

      if (aHasChief && !bHasChief) return -1;
      if (!aHasChief && bHasChief) return 1;

      return a.name.localeCompare(b.name);
    });

    return { success: true, statusCode: 200, data: formattedHostelSupervisors };
  }

  /**
   * Update hostel supervisor
   */
  async updateHostelSupervisor(id, supervisorData) {
    const { phone, profileImage, joinDate, hostelIds, category } = supervisorData;

    if (hostelIds && !Array.isArray(hostelIds)) {
      return { success: false, statusCode: 400, message: 'hostelIds must be an array' };
    }

    const updateData = {};
    let userUpdateData = {};

    if (hostelIds !== undefined) {
      const validHostelIds = Array.isArray(hostelIds) ? hostelIds : [];
      updateData.hostelIds = validHostelIds;
      updateData.status = validHostelIds.length > 0 ? 'assigned' : 'unassigned';

      const currentHS = await HostelSupervisor.findById(id).select('activeHostelId hostelIds').lean();
      if (!currentHS) {
        return { success: false, statusCode: 404, message: 'Hostel Supervisor not found' };
      }

      const currentActiveId = currentHS.activeHostelId ? currentHS.activeHostelId.toString() : null;
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
      const hostelSupervisor = await HostelSupervisor.findById(id).select('userId');
      if (!hostelSupervisor) {
        return { success: false, statusCode: 404, message: 'Hostel Supervisor not found' };
      }
      await User.findByIdAndUpdate(hostelSupervisor.userId, userUpdateData);
    }

    if (Object.keys(updateData).length > 0) {
      const updatedHostelSupervisor = await HostelSupervisor.findByIdAndUpdate(id, updateData, { new: true }).lean();
      if (!updatedHostelSupervisor) {
        return { success: false, statusCode: 404, message: 'Hostel Supervisor not found during update' };
      }
    } else if (Object.keys(userUpdateData).length === 0) {
      return { success: false, statusCode: 400, message: 'No update data provided' };
    }

    return { success: true, statusCode: 200, message: 'Hostel Supervisor updated successfully' };
  }

  /**
   * Delete hostel supervisor
   */
  async deleteHostelSupervisor(id) {
    const deletedHostelSupervisor = await HostelSupervisor.findByIdAndDelete(id);
    if (!deletedHostelSupervisor) {
      return { success: false, statusCode: 404, message: 'Hostel Supervisor not found' };
    }

    await User.findByIdAndDelete(deletedHostelSupervisor.userId);

    return { success: true, statusCode: 200, message: 'Hostel Supervisor deleted successfully' };
  }

  /**
   * Set active hostel for hostel supervisor
   */
  async setActiveHostelHS(userId, hostelId, session) {
    if (!hostelId) {
      return { success: false, statusCode: 400, message: 'hostelId is required in the request body' };
    }

    const hostelSupervisor = await HostelSupervisor.findOne({ userId });

    if (!hostelSupervisor) {
      return { success: false, statusCode: 404, message: 'Hostel Supervisor profile not found for this user' };
    }

    const isAssigned = hostelSupervisor.hostelIds.some((assignedHostelId) => assignedHostelId.equals(hostelId));

    if (!isAssigned) {
      return { success: false, statusCode: 403, message: 'Hostel Supervisor is not assigned to the specified hostel' };
    }

    hostelSupervisor.activeHostelId = hostelId;
    await hostelSupervisor.save();

    await hostelSupervisor.populate('activeHostelId', 'name type');

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
        message: 'Active hostel updated successfully for Hostel Supervisor',
        activeHostel: hostelSupervisor.activeHostelId,
      },
    };
  }
}

export const hostelSupervisorService = new HostelSupervisorService();
export default hostelSupervisorService;
