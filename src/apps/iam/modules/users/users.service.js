/**
 * User Service
 * Contains business logic for user operations.
 */

import bcrypt from 'bcrypt';
import { success, notFound, badRequest, forbidden } from '../../../../services/base/index.js';
import { userOwner } from '../../../../services/user/userOwner.service.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { revokeUserSessions } from '../../../../services/session/redisSessionMeta.service.js';
import { ROLE_HIERARCHY } from '../../../../core/constants/roles.constants.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

const ENTITY = 'User';

const escapeRegex = (value) => String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const roleRank = (role) => ROLE_HIERARCHY.indexOf(role);

/**
 * An actor may only manage passwords of users strictly below them in the
 * role hierarchy. Equal or higher ranks are always denied — this is what
 * stops an Admin from taking over Super Admin accounts.
 */
const canManageTargetRole = (actorRole, targetRole) => {
  const actorRank = roleRank(actorRole);
  const targetRank = roleRank(targetRole);
  if (actorRank < 0 || targetRank < 0) return false;
  return actorRank > targetRank;
};

const assertPasswordTargetsAllowed = (actor, targets) => {
  if (!actor?.role) {
    return forbidden('Authenticated user role is required');
  }
  const blocked = targets.filter((target) => !canManageTargetRole(actor.role, target.role));
  if (blocked.length > 0) {
    return forbidden(
      `Cannot manage passwords for ${blocked.length} account(s) with equal or higher privileges: ` +
        blocked.map((target) => target.label).join(', ')
    );
  }
  return null;
};

const revokeTargetSessions = async (userId) => {
  try {
    await revokeUserSessions(userId);
  } catch (err) {
    console.error('Failed to revoke target user sessions:', err?.message || err);
  }
};

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

  async bulkPasswordUpdate(actor, passwordUpdates) {
    if (!passwordUpdates || !Array.isArray(passwordUpdates)) {
      return badRequest('Password updates must be provided as an array');
    }
    if (passwordUpdates.length > MAX_BULK_RECORDS) {
      return badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`);
    }

    const emails = passwordUpdates.map((update) => update.email);
    const users = await userQueries.findUsers(
      { email: { $in: emails.map((email) => new RegExp(`^${escapeRegex(email)}$`, 'i')) } },
      { select: '+password' }
    );

    const userMap = new Map();
    users.forEach((user) => userMap.set(user.email.toLowerCase(), user));

    const denied = assertPasswordTargetsAllowed(
      actor,
      users.map((user) => ({ role: user.role, label: user.email }))
    );
    if (denied) return denied;

    const results = { successful: [], failed: [] };

    for (const update of passwordUpdates) {
      const { email, password } = update;

      try {
        const user = userMap.get(String(email || '').toLowerCase());

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
        await revokeTargetSessions(user._id);
        results.successful.push({ email });
      } catch (err) {
        results.failed.push({ email, reason: err.message });
      }
    }

    return success({ message: 'Bulk password update completed', results });
  }

  async removeUserPassword(actor, id) {
    const user = await userQueries.findUserById(id);
    if (!user) {
      return notFound(ENTITY);
    }

    const denied = assertPasswordTargetsAllowed(actor, [
      { role: user.role, label: user.email },
    ]);
    if (denied) return denied;

    user.password = null;
    await userOwner.persist(user);
    await revokeTargetSessions(user._id);

    return success({
      message: 'Password removed successfully',
      user: { _id: user._id, email: user.email, name: user.name },
    });
  }

  async bulkRemovePasswords(actor, emails) {
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return badRequest('Array of user emails is required');
    }

    const users = await userQueries.findUsers({
      email: { $in: emails.map((email) => new RegExp(`^${escapeRegex(email)}$`, 'i')) },
    });

    const userMap = new Map();
    users.forEach((user) => userMap.set(user.email.toLowerCase(), user));

    const denied = assertPasswordTargetsAllowed(
      actor,
      users.map((user) => ({ role: user.role, label: user.email }))
    );
    if (denied) return denied;

    const results = { successful: [], failed: [] };

    for (const email of emails) {
      try {
        const user = userMap.get(String(email || '').toLowerCase());

        if (!user) {
          results.failed.push({ email, reason: 'User not found' });
          continue;
        }

        user.password = null;
        await userOwner.persist(user);
        await revokeTargetSessions(user._id);
        results.successful.push({ email });
      } catch (err) {
        results.failed.push({ email, reason: err.message });
      }
    }

    return success({ message: 'Bulk password removal completed', results });
  }

  async removePasswordsByRole(actor, role) {
    if (!role) {
      return badRequest('Role is required');
    }

    if (!canManageTargetRole(actor?.role, role)) {
      return forbidden('Cannot remove passwords for accounts with equal or higher privileges');
    }

    const users = await userQueries.findUsers({ role });

    if (users.length === 0) {
      return notFound('No users found with the specified role');
    }

    for (const user of users) {
      user.password = null;
      await userOwner.persist(user);
      await revokeTargetSessions(user._id);
    }

    return success({
      message: `Passwords removed for ${users.length} users with role: ${role}`,
      count: users.length,
    });
  }
}

export const userService = new UserService();
export default userService;
