/**
 * User Service
 * Contains all business logic for user operations.
 * 
 * @module services/user
 */

import User from '../../models/User.js';
import bcrypt from 'bcrypt';

class UserService {
  /**
   * Search users by name or email
   */
  async searchUsers({ query, role }) {
    if (!query || query.trim() === '') {
      return { success: false, statusCode: 400, message: 'Search query is required' };
    }

    const searchQuery = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
    };

    if (role) {
      searchQuery.role = role;
    }

    const users = await User.find(searchQuery)
      .select('_id name email role phone profileImage')
      .limit(5);

    return { success: true, statusCode: 200, data: users };
  }

  /**
   * Get user by ID
   */
  async getUserById(id) {
    const user = await User.findById(id).select('_id name email role phone profileImage');

    if (!user) {
      return { success: false, statusCode: 404, message: 'User not found' };
    }

    return { success: true, statusCode: 200, data: user };
  }

  /**
   * Get users by role
   */
  async getUsersByRole(role) {
    if (!role) {
      return { success: false, statusCode: 400, message: 'Role parameter is required' };
    }

    const users = await User.find({ role })
      .select('_id name email role phone profileImage')
      .sort({ name: 1 })
      .limit(50);

    return { success: true, statusCode: 200, data: users };
  }

  /**
   * Bulk update user passwords
   */
  async bulkPasswordUpdate(passwordUpdates) {
    if (!passwordUpdates || !Array.isArray(passwordUpdates)) {
      return { success: false, statusCode: 400, message: 'Password updates must be provided as an array' };
    }

    const emails = passwordUpdates.map((update) => update.email);

    const users = await User.find({
      email: {
        $in: emails.map((email) => new RegExp(`^${email}$`, 'i')),
      },
    }).select('+password');

    const userMap = new Map();
    users.forEach((user) => userMap.set(user.email, user));

    const results = {
      successful: [],
      failed: [],
    };

    for (const update of passwordUpdates) {
      const { email, password } = update;

      try {
        const user = userMap.get(email);

        if (!user) {
          results.failed.push({ email, reason: 'User not found' });
          continue;
        }

        if (password === null || password === undefined || password === '') {
          user.password = null;
        } else {
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(password, salt);
          user.password = hashedPassword;
        }

        await user.save();
        results.successful.push({ email });
      } catch (error) {
        results.failed.push({ email, reason: error.message });
      }
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        message: 'Bulk password update completed',
        results,
      },
    };
  }

  /**
   * Remove password for a specific user
   */
  async removeUserPassword(id) {
    const user = await User.findById(id);
    if (!user) {
      return { success: false, statusCode: 404, message: 'User not found' };
    }

    user.password = null;
    await user.save();

    return {
      success: true,
      statusCode: 200,
      data: {
        message: 'Password removed successfully',
        user: {
          _id: user._id,
          email: user.email,
          name: user.name,
        },
      },
    };
  }

  /**
   * Bulk remove passwords for specified users
   */
  async bulkRemovePasswords(emails) {
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return { success: false, statusCode: 400, message: 'Array of user emails is required' };
    }

    const users = await User.find({
      email: {
        $in: emails.map((email) => new RegExp(`^${email}$`, 'i')),
      },
    });

    const userMap = new Map();
    users.forEach((user) => userMap.set(user.email, user));

    const results = {
      successful: [],
      failed: [],
    };

    for (const email of emails) {
      try {
        const user = userMap.get(email);

        if (!user) {
          results.failed.push({ email, reason: 'User not found' });
          continue;
        }

        user.password = null;
        await user.save();

        results.successful.push({ email });
      } catch (error) {
        results.failed.push({ email, reason: error.message });
      }
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        message: 'Bulk password removal completed',
        results,
      },
    };
  }

  /**
   * Remove passwords for all users with a specific role
   */
  async removePasswordsByRole(role) {
    if (!role) {
      return { success: false, statusCode: 400, message: 'Role is required' };
    }

    const users = await User.find({ role });

    if (users.length === 0) {
      return { success: false, statusCode: 404, message: 'No users found with the specified role' };
    }

    const updatePromises = users.map((user) => {
      user.password = null;
      return user.save();
    });

    await Promise.all(updatePromises);

    return {
      success: true,
      statusCode: 200,
      data: {
        message: `Passwords removed for ${users.length} users with role: ${role}`,
        count: users.length,
      },
    };
  }
}

export const userService = new UserService();
export default userService;
