/**
 * User Service
 * Contains business logic for user operations.
 */

import bcrypt from 'bcrypt';
import { success, notFound, badRequest } from '../../../../services/base/index.js';
import { userOwner } from '../../../../services/user/userOwner.service.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

const ENTITY = 'User';

class UserService {
  async searchUsers({ query, role }) {
    if (!query || query.trim() === '') {
      return badRequest('Search query is required');
    }

    const searchQuery = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
      ],
    };

    if (role) searchQuery.role = role;

    const users = await userQueries.findUsers(searchQuery, {
      select: '_id name email role phone profileImage',
      limit: 5,
    });

    return success(users);
  }

  async getUserById(id) {
    const user = await userQueries.findUserById(id, { select: '_id name email role phone profileImage' });

    if (!user) {
      return notFound(ENTITY);
    }

    return success(user);
  }

  async getUsersByRole(role) {
    if (!role) {
      return badRequest('Role parameter is required');
    }

    const users = await userQueries.findUsers(
      { role },
      { select: '_id name email role phone profileImage', sort: { name: 1 }, limit: 50 }
    );

    return success(users);
  }

  async bulkPasswordUpdate(passwordUpdates) {
    if (!passwordUpdates || !Array.isArray(passwordUpdates)) {
      return badRequest('Password updates must be provided as an array');
    }
    if (passwordUpdates.length > MAX_BULK_RECORDS) {
      return badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`);
    }

    const emails = passwordUpdates.map((update) => update.email);
    const users = await userQueries.findUsers(
      { email: { $in: emails.map((email) => new RegExp(`^${email}$`, 'i')) } },
      { select: '+password' }
    );

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

        await userOwner.persist(user);
        results.successful.push({ email });
      } catch (err) {
        results.failed.push({ email, reason: err.message });
      }
    }

    return success({ message: 'Bulk password update completed', results });
  }

  async removeUserPassword(id) {
    const user = await userQueries.findUserById(id);
    if (!user) {
      return notFound(ENTITY);
    }

    user.password = null;
    await userOwner.persist(user);

    return success({
      message: 'Password removed successfully',
      user: { _id: user._id, email: user.email, name: user.name },
    });
  }

  async bulkRemovePasswords(emails) {
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return badRequest('Array of user emails is required');
    }

    const users = await userQueries.findUsers({
      email: { $in: emails.map((email) => new RegExp(`^${email}$`, 'i')) },
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
        await userOwner.persist(user);
        results.successful.push({ email });
      } catch (err) {
        results.failed.push({ email, reason: err.message });
      }
    }

    return success({ message: 'Bulk password removal completed', results });
  }

  async removePasswordsByRole(role) {
    if (!role) {
      return badRequest('Role is required');
    }

    const users = await userQueries.findUsers({ role });

    if (users.length === 0) {
      return notFound('No users found with the specified role');
    }

    const updatePromises = users.map((user) => {
      user.password = null;
      return userOwner.persist(user);
    });

    await Promise.all(updatePromises);

    return success({
      message: `Passwords removed for ${users.length} users with role: ${role}`,
      count: users.length,
    });
  }
}

export const userService = new UserService();
export default userService;
