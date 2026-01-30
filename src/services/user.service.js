/**
 * User Service
 * Contains all business logic for user operations.
 * 
 * @module services/user
 */

import { User } from '../models/index.js';
import bcrypt from 'bcrypt';
import { BaseService, success, notFound, badRequest } from './base/index.js';

class UserService extends BaseService {
  constructor() {
    super(User, 'User');
  }

  /**
   * Search users by name or email
   * @param {Object} options - Search options
   */
  async searchUsers({ query, role }) {
    if (!query || query.trim() === '') {
      return badRequest('Search query is required');
    }

    const searchQuery = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } }
      ]
    };

    if (role) searchQuery.role = role;

    const users = await this.model.find(searchQuery)
      .select('_id name email role phone profileImage')
      .limit(5);

    return success(users);
  }

  /**
   * Get user by ID
   * @param {string} id - User ID
   */
  async getUserById(id) {
    const user = await this.model.findById(id).select('_id name email role phone profileImage');

    if (!user) {
      return notFound(this.entityName);
    }

    return success(user);
  }

  /**
   * Get users by role
   * @param {string} role - User role
   */
  async getUsersByRole(role) {
    if (!role) {
      return badRequest('Role parameter is required');
    }

    const users = await this.model.find({ role })
      .select('_id name email role phone profileImage')
      .sort({ name: 1 })
      .limit(50);

    return success(users);
  }

  /**
   * Bulk update user passwords
   * @param {Array} passwordUpdates - Array of {email, password} objects
   */
  async bulkPasswordUpdate(passwordUpdates) {
    if (!passwordUpdates || !Array.isArray(passwordUpdates)) {
      return badRequest('Password updates must be provided as an array');
    }

    const emails = passwordUpdates.map((update) => update.email);

    const users = await this.model.find({
      email: { $in: emails.map((email) => new RegExp(`^${email}$`, 'i')) }
    }).select('+password');

    const userMap = new Map();
    users.forEach((user) => userMap.set(user.email, user));

    const results = { successful: [], failed: [] };

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
      } catch (err) {
        results.failed.push({ email, reason: err.message });
      }
    }

    return success({ message: 'Bulk password update completed', results });
  }

  /**
   * Remove password for a specific user
   * @param {string} id - User ID
   */
  async removeUserPassword(id) {
    const user = await this.model.findById(id);
    if (!user) {
      return notFound(this.entityName);
    }

    user.password = null;
    await user.save();

    return success({
      message: 'Password removed successfully',
      user: { _id: user._id, email: user.email, name: user.name }
    });
  }

  /**
   * Bulk remove passwords for specified users
   * @param {Array} emails - Array of user emails
   */
  async bulkRemovePasswords(emails) {
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return badRequest('Array of user emails is required');
    }

    const users = await this.model.find({
      email: { $in: emails.map((email) => new RegExp(`^${email}$`, 'i')) }
    });

    const userMap = new Map();
    users.forEach((user) => userMap.set(user.email, user));

    const results = { successful: [], failed: [] };

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
      } catch (err) {
        results.failed.push({ email, reason: err.message });
      }
    }

    return success({ message: 'Bulk password removal completed', results });
  }

  /**
   * Remove passwords for all users with a specific role
   * @param {string} role - User role
   */
  async removePasswordsByRole(role) {
    if (!role) {
      return badRequest('Role is required');
    }

    const users = await this.model.find({ role });

    if (users.length === 0) {
      return notFound('No users found with the specified role');
    }

    const updatePromises = users.map((user) => {
      user.password = null;
      return user.save();
    });

    await Promise.all(updatePromises);

    return success({
      message: `Passwords removed for ${users.length} users with role: ${role}`,
      count: users.length
    });
  }
}

export const userService = new UserService();
export default userService;
