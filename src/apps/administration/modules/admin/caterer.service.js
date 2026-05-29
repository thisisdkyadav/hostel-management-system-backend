/**
 * Caterer Service
 * Handles dining caterer master-data operations for admin routes.
 */

import {
  BaseService,
  success,
  notFound,
  badRequest,
} from '../../../../services/base/index.js';
import { Caterer } from '../../../../models/index.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const normalizeText = (value = '') => String(value || '').trim();
const normalizeLower = (value = '') => normalizeText(value).toLowerCase();

const serializeCaterer = (caterer) => ({
  id: caterer._id,
  name: caterer.name,
  email: caterer.email,
  isArchived: Boolean(caterer.isArchived),
  createdAt: caterer.createdAt,
  updatedAt: caterer.updatedAt,
});

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

    const caterer = await new this.model(validation.data).save();

    return success(serializeCaterer(caterer), 201, 'Caterer added successfully');
  }

  async updateCaterer(catererId, updateData) {
    const validation = this.validateCatererPayload(updateData);

    if (validation.error) {
      return badRequest(validation.error);
    }

    const duplicateMessage = await this.ensureUniqueCaterer(validation.data, catererId);
    if (duplicateMessage) {
      return badRequest(duplicateMessage);
    }

    const updatedCaterer = await this.model.findByIdAndUpdate(
      catererId,
      validation.data,
      { new: true, runValidators: true },
    );

    if (!updatedCaterer) {
      return notFound('Caterer not found');
    }

    return success(serializeCaterer(updatedCaterer), 200, 'Caterer updated successfully');
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
