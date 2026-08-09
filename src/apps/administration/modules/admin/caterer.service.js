/**
 * Caterer Service
 * Handles dining caterer master-data operations for admin routes.
 */

import {
  BaseService,
  success,
  notFound,
  badRequest,
  conflict,
} from '../../../../services/base/index.js';
import { Caterer } from '../../../../models/index.js';
import { userOwner } from '../../../../services/user/userOwner.service.js';
import { userQueries } from '../../../../services/user/userQueries.service.js';
import { ROLES, DINING_SUBROLES } from '../../../../core/constants/roles.constants.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeText = (value = '') => String(value || '').trim();
const normalizeLower = (value = '') => normalizeText(value).toLowerCase();
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const serializeCaterer = (caterer) => ({
  id: caterer._id,
  name: caterer.name,
  email: caterer.email,
  isArchived: Boolean(caterer.isArchived),
  createdAt: caterer.createdAt,
  updatedAt: caterer.updatedAt,
});

export const findUserByEmail = (email, excludeUserId = null) => {
  const query = {
    email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
  };

  if (excludeUserId) {
    query._id = { $ne: excludeUserId };
  }

  return userQueries.findOneUser(query, { select: '_id role email', lean: true });
};

class CatererService extends BaseService {
  constructor() {
    super(Caterer, 'Caterer');
  }

  validateCatererPayload(payload = {}) {
    const name = normalizeText(payload.name);
    const email = normalizeLower(payload.email);

    if (!name || !email) {
      return { error: 'Name and email are required' };
    }

    if (!EMAIL_REGEX.test(email)) {
      return { error: 'Please provide a valid caterer email' };
    }

    return {
      data: {
        name,
        nameLower: name.toLowerCase(),
        email,
        emailLower: email,
      },
    };
  }

  async ensureUniqueCaterer({ nameLower, emailLower }, excludeId = null) {
    const query = {
      $or: [
        { nameLower },
        { emailLower },
      ],
    };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existing = await this.model
      .findOne(query)
      .select('+nameLower +emailLower')
      .lean();

    if (!existing) return null;

    if (existing.nameLower === nameLower) {
      return 'A caterer with this name already exists';
    }

    return 'A caterer with this email already exists';
  }

  async ensureAvailableLoginEmail(email, excludeUserId = null) {
    const existingUser = await findUserByEmail(email, excludeUserId);
    if (existingUser) {
      return 'A user with this email already exists';
    }

    return null;
  }

  async createCatererLogin({ name, email }) {
    return userOwner.createUser({
      name,
      email,
      role: ROLES.DINING,
      subRole: DINING_SUBROLES.CATERER,
      password: null,
    });
  }

  async ensureCatererLogin(catererOrId) {
    const caterer = typeof catererOrId === 'object' && catererOrId?._id
      ? catererOrId
      : await this.model.findById(catererOrId).select('+emailLower');

    if (!caterer) {
      return null;
    }

    if (caterer.userId) {
      const linkedUser = await userQueries.findUserById(caterer.userId, { select: '_id role email' });
      if (linkedUser) {
        const normalizedEmail = normalizeLower(caterer.email || caterer.emailLower);
        const userUpdate = {
          name: caterer.name,
          role: ROLES.DINING,
          subRole: DINING_SUBROLES.CATERER,
        };

        if (normalizedEmail && normalizeLower(linkedUser.email) !== normalizedEmail) {
          const emailConflict = await this.ensureAvailableLoginEmail(normalizedEmail, linkedUser._id);
          if (emailConflict) {
            throw new Error(emailConflict);
          }
          userUpdate.email = normalizedEmail;
        }

        await userOwner.updateOneUser({ _id: linkedUser._id }, userUpdate);
        return linkedUser;
      }
    }

    const normalizedEmail = normalizeLower(caterer.email || caterer.emailLower);
    const emailConflict = await this.ensureAvailableLoginEmail(normalizedEmail);
    if (emailConflict) {
      throw new Error(emailConflict);
    }

    const user = await this.createCatererLogin({
      name: caterer.name,
      email: normalizedEmail,
    });

    caterer.userId = user._id;
    await caterer.save();

    return user;
  }

  async ensureCatererLogins(catererIds = []) {
    const uniqueIds = [...new Set(catererIds.map((id) => String(id || '').trim()).filter(Boolean))];
    const caterers = await this.model.find({ _id: { $in: uniqueIds } }).select('+emailLower');

    for (const caterer of caterers) {
      await this.ensureCatererLogin(caterer);
    }
  }

  async getCaterers(archive = 'false') {
    const caterers = await this.model
      .find({ isArchived: archive === 'true' })
      .sort({ name: 1 })
      .lean();

    return success(caterers.map(serializeCaterer));
  }

  async createCaterer(catererData) {
    const validation = this.validateCatererPayload(catererData);

    if (validation.error) {
      return badRequest(validation.error);
    }

    const duplicateMessage = await this.ensureUniqueCaterer(validation.data);
    if (duplicateMessage) {
      return badRequest(duplicateMessage);
    }

    const loginEmailConflict = await this.ensureAvailableLoginEmail(validation.data.email);
    if (loginEmailConflict) {
      return conflict(loginEmailConflict);
    }

    const user = await this.createCatererLogin({
      name: validation.data.name,
      email: validation.data.email,
    });

    let caterer;
    try {
      caterer = await new this.model({
        ...validation.data,
        userId: user._id,
      }).save();
    } catch (error) {
      await userOwner.deleteUserById(user._id);
      throw error;
    }

    return success(serializeCaterer(caterer), 201, 'Caterer added successfully');
  }

  async updateCaterer(catererId, updateData) {
    const validation = this.validateCatererPayload(updateData);

    if (validation.error) {
      return badRequest(validation.error);
    }

    const caterer = await this.model.findById(catererId).select('+emailLower');
    if (!caterer) {
      return notFound('Caterer not found');
    }

    const duplicateMessage = await this.ensureUniqueCaterer(validation.data, catererId);
    if (duplicateMessage) {
      return badRequest(duplicateMessage);
    }

    const loginEmailConflict = await this.ensureAvailableLoginEmail(validation.data.email, caterer.userId);
    if (loginEmailConflict) {
      return conflict(loginEmailConflict);
    }

    caterer.name = validation.data.name;
    caterer.nameLower = validation.data.nameLower;
    caterer.email = validation.data.email;
    caterer.emailLower = validation.data.emailLower;

    await caterer.save();
    await this.ensureCatererLogin(caterer);

    return success(serializeCaterer(caterer), 200, 'Caterer updated successfully');
  }

  async changeArchiveStatus(catererId, status) {
    const updatedCaterer = await this.model.findByIdAndUpdate(
      catererId,
      { isArchived: Boolean(status) },
      { new: true },
    );

    if (!updatedCaterer) {
      return notFound('Caterer not found');
    }

    return success(
      serializeCaterer(updatedCaterer),
      200,
      updatedCaterer.isArchived ? 'Caterer archived successfully' : 'Caterer unarchived successfully',
    );
  }
}

export const catererService = new CatererService();
export default catererService;
