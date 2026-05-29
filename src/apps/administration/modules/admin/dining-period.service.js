/**
 * Dining Period Service
 * Handles caterer allocation period master-data for admin routes.
 */

import mongoose from 'mongoose';
import {
  BaseService,
  success,
  notFound,
  badRequest,
} from '../../../../services/base/index.js';
import { Caterer, DiningPeriod, StudentProfile } from '../../../../models/index.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

const ELIGIBILITY_MODE_ALL_ACTIVE = 'all-active';
const ELIGIBILITY_MODE_CUSTOM = 'custom';
const VALID_ELIGIBILITY_MODES = new Set([ELIGIBILITY_MODE_ALL_ACTIVE, ELIGIBILITY_MODE_CUSTOM]);

const normalizeRollNumber = (value = '') => String(value || '').trim().toUpperCase();

const normalizeRollNumbers = (values = []) => (
  [...new Set(
    (Array.isArray(values) ? values : [])
      .map(normalizeRollNumber)
      .filter(Boolean)
  )]
);

const normalizeObjectIds = (values = []) => (
  [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )]
);

const getPeriodStatus = (period) => {
  const now = new Date();
  const startDate = new Date(period.startDate);
  const endDate = new Date(period.endDate);

  if (period.isArchived) return 'Archived';
  if (now < startDate) return 'Upcoming';
  if (now > endDate) return 'Closed';
  return 'Open';
};

const serializeCaterer = (caterer = {}) => ({
  id: caterer._id || caterer.id,
  name: caterer.name,
  email: caterer.email,
});

const serializePeriod = (period, activeStudentCount = 0) => {
  const caterers = Array.isArray(period.catererIds)
    ? period.catererIds.filter((item) => item && typeof item === 'object' && item.name).map(serializeCaterer)
    : [];
  const rawCatererIds = Array.isArray(period.catererIds)
    ? period.catererIds.map((item) => item?._id || item).filter(Boolean)
    : [];
  const eligibleRollNumbers = Array.isArray(period.eligibleRollNumbers) ? period.eligibleRollNumbers : [];

  return {
    id: period._id || period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    catererIds: rawCatererIds,
    caterers,
    eligibilityMode: period.eligibilityMode,
    eligibleRollNumbers,
    eligibleStudentCount: period.eligibilityMode === ELIGIBILITY_MODE_ALL_ACTIVE
      ? activeStudentCount
      : eligibleRollNumbers.length,
    isArchived: Boolean(period.isArchived),
    status: getPeriodStatus(period),
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
  };
};

class DiningPeriodService extends BaseService {
  constructor() {
    super(DiningPeriod, 'DiningPeriod');
  }

  async validatePeriodPayload(payload = {}) {
    const startDate = payload.startDate ? new Date(payload.startDate) : null;
    const endDate = payload.endDate ? new Date(payload.endDate) : null;
    const catererIds = normalizeObjectIds(payload.catererIds);
    const eligibilityMode = String(payload.eligibilityMode || ELIGIBILITY_MODE_ALL_ACTIVE).trim();
    const eligibleRollNumbers = normalizeRollNumbers(payload.eligibleRollNumbers);

    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return { error: 'Start date and end date are required' };
    }

    if (startDate > endDate) {
      return { error: 'Start date must be before or equal to end date' };
    }

    if (catererIds.length === 0) {
      return { error: 'Please select at least one caterer' };
    }

    const invalidCatererId = catererIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidCatererId) {
      return { error: 'Invalid caterer selected' };
    }

    if (!VALID_ELIGIBILITY_MODES.has(eligibilityMode)) {
      return { error: 'Invalid student eligibility mode' };
    }

    if (eligibilityMode === ELIGIBILITY_MODE_CUSTOM && eligibleRollNumbers.length === 0) {
      return { error: 'Please upload at least one roll number for custom eligibility' };
    }

    if (eligibleRollNumbers.length > MAX_BULK_RECORDS) {
      return { error: `Maximum ${MAX_BULK_RECORDS} roll numbers are allowed per request` };
    }

    const activeCatererCount = await Caterer.countDocuments({
      _id: { $in: catererIds },
      isArchived: false,
    });

    if (activeCatererCount !== catererIds.length) {
      return { error: 'One or more selected caterers are unavailable or archived' };
    }

    let eligibleStudentCount = await StudentProfile.countDocuments({ status: 'Active' });
    let resolvedRollNumbers = [];

    if (eligibilityMode === ELIGIBILITY_MODE_CUSTOM) {
      const activeStudents = await StudentProfile.find({
        rollNumber: { $in: eligibleRollNumbers },
        status: 'Active',
      })
        .select('rollNumber')
        .lean();

      const activeRollNumberSet = new Set(activeStudents.map((student) => student.rollNumber));
      const unmatchedRollNumbers = eligibleRollNumbers.filter((rollNumber) => !activeRollNumberSet.has(rollNumber));

      if (unmatchedRollNumbers.length > 0) {
        const sample = unmatchedRollNumbers.slice(0, 8).join(', ');
        const suffix = unmatchedRollNumbers.length > 8 ? ` and ${unmatchedRollNumbers.length - 8} more` : '';
        return { error: `These roll numbers are not active students: ${sample}${suffix}` };
      }

      resolvedRollNumbers = eligibleRollNumbers;
      eligibleStudentCount = resolvedRollNumbers.length;
    }

    return {
      data: {
        startDate,
        endDate,
        catererIds,
        eligibilityMode,
        eligibleRollNumbers: eligibilityMode === ELIGIBILITY_MODE_CUSTOM ? resolvedRollNumbers : [],
        eligibleStudentCount,
      },
    };
  }

  async getDiningPeriods(archive = 'false') {
    const [periods, activeStudentCount] = await Promise.all([
      this.model
        .find({ isArchived: archive === 'true' })
        .populate({ path: 'catererIds', select: 'name email' })
        .sort({ startDate: -1, createdAt: -1 })
        .lean(),
      StudentProfile.countDocuments({ status: 'Active' }),
    ]);

    return success(periods.map((period) => serializePeriod(period, activeStudentCount)));
  }

  async createDiningPeriod(payload) {
    const validation = await this.validatePeriodPayload(payload);

    if (validation.error) {
      return badRequest(validation.error);
    }

    const period = await new this.model(validation.data).save();
    const populatedPeriod = await this.model
      .findById(period._id)
      .populate({ path: 'catererIds', select: 'name email' })
      .lean();

    return success(serializePeriod(populatedPeriod, validation.data.eligibleStudentCount), 201, 'Dining period created successfully');
  }

  async updateDiningPeriod(periodId, payload) {
    const validation = await this.validatePeriodPayload(payload);

    if (validation.error) {
      return badRequest(validation.error);
    }

    const updatedPeriod = await this.model
      .findByIdAndUpdate(periodId, validation.data, { new: true, runValidators: true })
      .populate({ path: 'catererIds', select: 'name email' })
      .lean();

    if (!updatedPeriod) {
      return notFound('Dining period');
    }

    return success(serializePeriod(updatedPeriod, validation.data.eligibleStudentCount), 200, 'Dining period updated successfully');
  }

  async changeArchiveStatus(periodId, status) {
    const updatedPeriod = await this.model
      .findByIdAndUpdate(periodId, { isArchived: Boolean(status) }, { new: true })
      .populate({ path: 'catererIds', select: 'name email' })
      .lean();

    if (!updatedPeriod) {
      return notFound('Dining period');
    }

    const activeStudentCount = await StudentProfile.countDocuments({ status: 'Active' });

    return success(
      serializePeriod(updatedPeriod, activeStudentCount),
      200,
      updatedPeriod.isArchived ? 'Dining period archived successfully' : 'Dining period unarchived successfully',
    );
  }
}

export const diningPeriodService = new DiningPeriodService();
export default diningPeriodService;
