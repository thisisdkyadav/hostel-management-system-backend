/**
 * Admin Service
 * Contains all business logic for admin operations.
 * 
 * @module services/admin
 */

import Warden from '../../models/Warden.js';
import User from '../../models/User.js';
import bcrypt from 'bcrypt';
import Security from '../../models/Security.js';
import MaintenanceStaff from '../../models/MaintenanceStaff.js';
import Task from '../../models/Task.js';
import StudentProfile from '../../models/StudentProfile.js';
import Configuration from '../../models/configuration.js';
import Complaint from '../../models/Complaint.js';

class AdminService {
  /**
   * Create a security user
   * @param {Object} data - Security data
   * @returns {Object} Result object
   */
  async createSecurity({ email, password, name, hostelId }) {
    console.log('Creating security with data:', { email, name, hostelId });

    if (!email || !password || !name || !hostelId) {
      return {
        success: false,
        statusCode: 400,
        message: 'Email, password, name, and hostelId are required',
      };
    }

    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (existingUser) {
      return {
        success: false,
        statusCode: 400,
        message: 'User with this email already exists',
      };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'Security',
    });

    const savedUser = await newUser.save();

    console.log('Saved User:', savedUser);
    console.log('Hostel ID:', hostelId);

    const newSecurity = new Security({
      userId: savedUser._id,
      hostelId,
    });

    console.log('New Security:', newSecurity);

    const savedSecurity = await newSecurity.save();

    console.log('Saved Security:', savedSecurity);

    return {
      success: true,
      statusCode: 201,
      message: 'Security created successfully',
      data: {
        security: {
          ...savedSecurity._doc,
          user: {
            name: savedUser.name,
            email: savedUser.email,
            phone: savedUser.phone,
          },
        },
      },
    };
  }

  /**
   * Get all securities
   * @returns {Object} Result object
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
      hostelId: security.hostelId || null,
    }));

    return {
      success: true,
      statusCode: 200,
      data: formattedSecurities,
    };
  }

  /**
   * Update a security
   * @param {string} id - Security ID
   * @param {Object} updateData - Update data
   * @returns {Object} Result object
   */
  async updateSecurity(id, { hostelId, name }) {
    const updateData = {};
    updateData.hostelId = hostelId || null;

    const updatedSecurity = await Security.findByIdAndUpdate(id, updateData, { new: true });

    if (!updatedSecurity) {
      return {
        success: false,
        statusCode: 404,
        message: 'Security not found',
      };
    }

    if (name !== undefined) {
      await User.findByIdAndUpdate(updatedSecurity.userId, { name });
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Security updated successfully',
    };
  }

  /**
   * Delete a security
   * @param {string} id - Security ID
   * @returns {Object} Result object
   */
  async deleteSecurity(id) {
    const deletedSecurity = await Security.findByIdAndDelete(id);
    if (!deletedSecurity) {
      return {
        success: false,
        statusCode: 404,
        message: 'Security not found',
      };
    }

    await User.findByIdAndDelete(deletedSecurity.userId);

    return {
      success: true,
      statusCode: 200,
      message: 'Security deleted successfully',
    };
  }

  /**
   * Update user password
   * @param {string} email - User email
   * @param {string} newPassword - New password
   * @returns {Object} Result object
   */
  async updateUserPassword(email, newPassword) {
    console.log('Updating password for email:', email);
    console.log('New password:', newPassword);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    const updatedUser = await User.findOneAndUpdate(
      { email: { $regex: new RegExp(`^${email}$`, 'i') } },
      { password: hashedPassword },
      { new: true }
    );

    console.log('Updated User:', updatedUser);

    if (!updatedUser) {
      return {
        success: false,
        statusCode: 404,
        message: 'User not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Password updated successfully',
    };
  }

  /**
   * Create a maintenance staff
   * @param {Object} data - Staff data
   * @returns {Object} Result object
   */
  async createMaintenanceStaff({ email, password, name, phone, category }) {
    if (!email || !password || !name || !category) {
      return {
        success: false,
        statusCode: 400,
        message: 'Email, password, name, and category are required',
      };
    }

    const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    if (existingUser) {
      return {
        success: false,
        statusCode: 400,
        message: 'User with this email already exists',
      };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'Maintenance Staff',
      phone: phone || null,
    });

    const savedUser = await newUser.save();

    const newMaintenanceStaff = new MaintenanceStaff({
      userId: savedUser._id,
      category,
    });

    await newMaintenanceStaff.save();

    return {
      success: true,
      statusCode: 201,
      message: 'Maintenance staff created successfully',
    };
  }

  /**
   * Get all maintenance staff
   * @returns {Object} Result object
   */
  async getAllMaintenanceStaff() {
    const maintenanceStaff = await MaintenanceStaff.find()
      .populate('userId', 'name email phone profileImage')
      .exec();

    const formattedMaintenanceStaff = maintenanceStaff.map((staff) => ({
      id: staff._id,
      userId: staff.userId._id,
      name: staff.userId.name,
      email: staff.userId.email,
      phone: staff.userId.phone,
      category: staff.category || null,
      profileImage: staff.userId.profileImage,
    }));

    return {
      success: true,
      statusCode: 200,
      data: formattedMaintenanceStaff,
    };
  }

  /**
   * Update a maintenance staff
   * @param {string} id - Staff ID
   * @param {Object} updateData - Update data
   * @returns {Object} Result object
   */
  async updateMaintenanceStaff(id, { name, phone, profileImage, category }) {
    console.log('Updating maintenance staff with data:', { name, phone, profileImage, category });

    const updateData = {};

    if (category !== undefined) {
      updateData.category = category;
    }

    const updatedStaff = await MaintenanceStaff.findByIdAndUpdate(id, updateData, { new: true });

    if (!updatedStaff) {
      return {
        success: false,
        statusCode: 404,
        message: 'Maintenance staff not found',
      };
    }

    const updateUserData = {};

    if (name !== undefined) {
      updateUserData.name = name;
    }

    if (phone !== undefined) {
      updateUserData.phone = phone;
    }

    if (profileImage !== undefined) {
      updateUserData.profileImage = profileImage;
    }

    if (Object.keys(updateUserData).length > 0) {
      await User.findByIdAndUpdate(updatedStaff.userId, updateUserData);
    }

    console.log('Updated Maintenance Staff:', updatedStaff);

    return {
      success: true,
      statusCode: 200,
      message: 'Maintenance staff updated successfully',
    };
  }

  /**
   * Delete a maintenance staff
   * @param {string} id - Staff ID
   * @returns {Object} Result object
   */
  async deleteMaintenanceStaff(id) {
    const deletedStaff = await MaintenanceStaff.findByIdAndDelete(id);
    if (!deletedStaff) {
      return {
        success: false,
        statusCode: 404,
        message: 'Maintenance staff not found',
      };
    }

    await User.findByIdAndDelete(deletedStaff.userId);

    return {
      success: true,
      statusCode: 200,
      message: 'Maintenance staff deleted successfully',
    };
  }

  /**
   * Get task statistics
   * @returns {Object} Result object
   */
  async getTaskStats() {
    // Get counts of tasks by status
    const taskStats = await Task.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get counts of tasks by category
    const categoryStats = await Task.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get counts of tasks by priority
    const priorityStats = await Task.aggregate([
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get overdue tasks count (due date < now and status not Completed)
    const overdueTasks = await Task.countDocuments({
      dueDate: { $lt: new Date() },
      status: { $ne: 'Completed' },
    });

    // Format the response
    const formattedTaskStats = taskStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const formattedCategoryStats = categoryStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    const formattedPriorityStats = priorityStats.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    return {
      success: true,
      statusCode: 200,
      data: {
        statusCounts: formattedTaskStats,
        categoryCounts: formattedCategoryStats,
        priorityCounts: formattedPriorityStats,
        overdueTasks,
      },
    };
  }

  /**
   * Get list of departments
   * @returns {Object} Result object
   */
  async getDepartmentsList() {
    const departments = await StudentProfile.distinct('department');

    return {
      success: true,
      statusCode: 200,
      data: departments,
    };
  }

  /**
   * Rename a department
   * @param {string} oldName - Old department name
   * @param {string} newName - New department name
   * @returns {Object} Result object
   */
  async renameDepartment(oldName, newName) {
    const session = await StudentProfile.startSession();
    session.startTransaction();

    try {
      await StudentProfile.updateMany(
        { department: oldName },
        { $set: { department: newName } },
        { session }
      );

      const departments = await Configuration.findOne({ key: 'departments' }).session(session);
      if (!departments) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          statusCode: 404,
          message: 'Departments configuration not found',
        };
      }

      departments.value = departments.value.map((department) =>
        department === oldName ? newName : department
      );
      await departments.save({ session });

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        statusCode: 200,
        message: 'Department renamed successfully',
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Get list of degrees
   * @returns {Object} Result object
   */
  async getDegreesList() {
    const degrees = await StudentProfile.distinct('degree');

    return {
      success: true,
      statusCode: 200,
      data: degrees,
    };
  }

  /**
   * Rename a degree
   * @param {string} oldName - Old degree name
   * @param {string} newName - New degree name
   * @returns {Object} Result object
   */
  async renameDegree(oldName, newName) {
    const session = await StudentProfile.startSession();
    session.startTransaction();

    try {
      await StudentProfile.updateMany(
        { degree: oldName },
        { $set: { degree: newName } },
        { session }
      );

      const degrees = await Configuration.findOne({ key: 'degrees' }).session(session);
      if (!degrees) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          statusCode: 404,
          message: 'Degrees configuration not found',
        };
      }

      degrees.value = degrees.value.map((degree) =>
        degree === oldName ? newName : degree
      );
      await degrees.save({ session });

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        statusCode: 200,
        message: 'Degree renamed successfully',
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Get maintenance staff statistics
   * @param {string} staffId - Staff ID
   * @returns {Object} Result object
   */
  async getMaintenanceStaffStats(staffId) {
    const totalWorkDone = await Complaint.countDocuments({ resolvedBy: staffId });
    const todayWorkDone = await Complaint.countDocuments({
      resolvedBy: staffId,
      resolvedDate: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    });

    return {
      success: true,
      statusCode: 200,
      data: { totalWorkDone, todayWorkDone },
    };
  }
}

export const adminService = new AdminService();
export default adminService;
