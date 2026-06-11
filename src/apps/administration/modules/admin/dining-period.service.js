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
import { catererService } from './caterer.service.js';

const ELIGIBILITY_MODE_ALL_ACTIVE = 'all-active';
const ELIGIBILITY_MODE_CUSTOM = 'custom';
const VALID_ELIGIBILITY_MODES = new Set([ELIGIBILITY_MODE_ALL_ACTIVE, ELIGIBILITY_MODE_CUSTOM]);
const DEFAULT_MEAL_SLOTS = [
  { name: 'Breakfast', startTime: '07:00', endTime: '10:00' },
  { name: 'Lunch', startTime: '12:00', endTime: '15:00' },
  { name: 'Dinner', startTime: '19:00', endTime: '22:00' },
];
const DEFAULT_REBATE_SETTINGS = {
  shortTermMaxTotalDays: 10,
  shortTermMaxContinuousDays: 3,
  shortTermMinApplicationDays: 1,
  shortTermMinAdvanceDays: 2,
};
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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

const normalizeCatererCapacities = (values = []) => {
  if (!Array.isArray(values)) return [];

  const capacityByCaterer = new Map();
  values.forEach((entry) => {
    const catererId = String(entry?.catererId || '').trim();
    const maxStudentCount = Number(entry?.maxStudentCount || 0);
    const allocatedCount = Math.max(0, Number(entry?.allocatedCount || 0));

    if (!catererId || !Number.isFinite(maxStudentCount)) return;

    capacityByCaterer.set(catererId, {
      catererId,
      maxStudentCount: Math.floor(maxStudentCount),
      allocatedCount: Math.floor(allocatedCount),
    });
  });

  return [...capacityByCaterer.values()];
};

const normalizeMealSlots = (values = []) => {
  const slots = Array.isArray(values) && values.length > 0 ? values : DEFAULT_MEAL_SLOTS;
  return slots
    .map((slot) => ({
      name: String(slot?.name || '').trim(),
      startTime: String(slot?.startTime || '').trim(),
      endTime: String(slot?.endTime || '').trim(),
    }))
    .filter((slot) => slot.name || slot.startTime || slot.endTime);
};

const normalizeRebateSettings = (value = {}) => {
  const numberOrDefault = (rawValue, fallback) => {
    const numeric = Number(rawValue);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  return {
    shortTermMaxTotalDays: Math.max(0, Math.floor(numberOrDefault(value.shortTermMaxTotalDays, DEFAULT_REBATE_SETTINGS.shortTermMaxTotalDays))),
    shortTermMaxContinuousDays: Math.max(1, Math.floor(numberOrDefault(value.shortTermMaxContinuousDays, DEFAULT_REBATE_SETTINGS.shortTermMaxContinuousDays))),
    shortTermMinApplicationDays: Math.max(1, Math.floor(numberOrDefault(value.shortTermMinApplicationDays, DEFAULT_REBATE_SETTINGS.shortTermMinApplicationDays))),
    shortTermMinAdvanceDays: Math.max(0, Math.floor(numberOrDefault(value.shortTermMinAdvanceDays, DEFAULT_REBATE_SETTINGS.shortTermMinAdvanceDays))),
  };
};

const getExistingAllocatedCountByCaterer = (period = {}) => {
  const allocatedCountByCaterer = new Map();
  (Array.isArray(period.catererCapacities) ? period.catererCapacities : []).forEach((entry) => {
    const catererId = String(entry?.catererId?._id || entry?.catererId || '');
    if (!catererId) return;

    allocatedCountByCaterer.set(catererId, Math.max(0, Number(entry?.allocatedCount || 0)));
  });
  return allocatedCountByCaterer;
};

const getPeriodStatus = (period) => {
  const now = new Date();
  const startDate = new Date(period.startDate);
  const endDate = new Date(period.endDate);

  if (period.isArchived) return 'Archived';
  if (now < startDate) return 'Upcoming';
  if (now > endDate) return 'Closed';
  return 'Open';
};

const getAllocationStatus = (period) => {
  const now = new Date();
  const allocationStartAt = period.allocationStartAt ? new Date(period.allocationStartAt) : null;
  const allocationEndAt = period.allocationEndAt ? new Date(period.allocationEndAt) : null;

  if (period.isArchived) return 'Archived';
  if (!allocationStartAt || !allocationEndAt) return 'Not configured';
  if (now < allocationStartAt) return 'Not started';
  if (now > allocationEndAt) return 'Closed';
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
  const mealSlots = normalizeMealSlots(period.mealSlots);
  const rebateSettings = normalizeRebateSettings(period.rebateSettings);
  const catererMap = new Map(caterers.map((caterer) => [String(caterer.id), caterer]));
  const catererCapacities = Array.isArray(period.catererCapacities)
    ? period.catererCapacities.map((entry) => {
      const catererId = String(entry.catererId?._id || entry.catererId || '');
      const caterer = catererMap.get(catererId) || null;
      const maxStudentCount = Number(entry.maxStudentCount || 0);
      const allocatedCount = Number(entry.allocatedCount || 0);
      return {
        catererId,
        caterer,
        maxStudentCount,
        allocatedCount,
        remainingSeats: Math.max(maxStudentCount - allocatedCount, 0),
      };
    })
    : [];
  const totalCapacity = catererCapacities.reduce((sum, entry) => sum + entry.maxStudentCount, 0);

  return {
    id: period._id || period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    allocationStartAt: period.allocationStartAt,
    allocationEndAt: period.allocationEndAt,
    catererIds: rawCatererIds,
    caterers,
    catererCapacities,
    totalCapacity,
    eligibilityMode: period.eligibilityMode,
    eligibleRollNumbers,
    mealSlots,
    rebateSettings,
    eligibleStudentCount: period.eligibilityMode === ELIGIBILITY_MODE_ALL_ACTIVE
      ? activeStudentCount
      : eligibleRollNumbers.length,
    isArchived: Boolean(period.isArchived),
    status: getPeriodStatus(period),
    allocationStatus: getAllocationStatus(period),
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
  };
};

class DiningPeriodService extends BaseService {
  constructor() {
    super(DiningPeriod, 'DiningPeriod');
  }

  async validatePeriodPayload(payload = {}, existingPeriod = null) {
    const startDate = payload.startDate ? new Date(payload.startDate) : null;
    const endDate = payload.endDate ? new Date(payload.endDate) : null;
    const allocationStartAt = payload.allocationStartAt ? new Date(payload.allocationStartAt) : null;
    const allocationEndAt = payload.allocationEndAt ? new Date(payload.allocationEndAt) : null;
    const rawCatererIds = normalizeObjectIds(payload.catererIds);
    let catererCapacities = normalizeCatererCapacities(payload.catererCapacities);
    const catererIds = rawCatererIds.length > 0
      ? rawCatererIds
      : catererCapacities.map((entry) => entry.catererId);
    const eligibilityMode = String(payload.eligibilityMode || ELIGIBILITY_MODE_ALL_ACTIVE).trim();
    const eligibleRollNumbers = normalizeRollNumbers(payload.eligibleRollNumbers);
    const mealSlots = normalizeMealSlots(payload.mealSlots);
    const rebateSettings = normalizeRebateSettings(payload.rebateSettings);

    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return { error: 'Start date and end date are required' };
    }

    if (!allocationStartAt || Number.isNaN(allocationStartAt.getTime()) || !allocationEndAt || Number.isNaN(allocationEndAt.getTime())) {
      return { error: 'Allocation start time and end time are required' };
    }

    if (startDate > endDate) {
      return { error: 'Start date must be before or equal to end date' };
    }

    if (allocationStartAt > allocationEndAt) {
      return { error: 'Allocation start time must be before or equal to allocation end time' };
    }

    if (catererIds.length === 0) {
      return { error: 'Please select at least one caterer' };
    }

    if (mealSlots.length === 0) {
      return { error: 'Please configure at least one meal verification slot' };
    }

    const invalidMealSlot = mealSlots.find((slot) => !slot.name || !TIME_PATTERN.test(slot.startTime) || !TIME_PATTERN.test(slot.endTime));
    if (invalidMealSlot) {
      return { error: 'Each meal verification slot must have a name and valid HH:mm start/end time' };
    }

    const duplicateMealSlotName = mealSlots.find((slot, index) => (
      mealSlots.findIndex((candidate) => candidate.name.toLowerCase() === slot.name.toLowerCase()) !== index
    ));
    if (duplicateMealSlotName) {
      return { error: 'Meal verification slot names must be unique within a period' };
    }

    if (rebateSettings.shortTermMinApplicationDays > rebateSettings.shortTermMaxContinuousDays) {
      return { error: 'Minimum short-term rebate days cannot exceed the max continuous short-term days' };
    }

    if (catererCapacities.length !== catererIds.length) {
      return { error: 'Please provide maximum student count for each selected caterer' };
    }

    const invalidCatererId = catererIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidCatererId) {
      return { error: 'Invalid caterer selected' };
    }

    const capacityCatererSet = new Set(catererCapacities.map((entry) => entry.catererId));
    const missingCapacityCaterer = catererIds.find((catererId) => !capacityCatererSet.has(catererId));
    if (missingCapacityCaterer) {
      return { error: 'Please provide maximum student count for each selected caterer' };
    }

    const invalidCapacity = catererCapacities.find((entry) => entry.maxStudentCount < 1);
    if (invalidCapacity) {
      return { error: 'Each caterer must have a maximum student count of at least 1' };
    }

    const existingAllocatedCountByCaterer = getExistingAllocatedCountByCaterer(existingPeriod);
    const removedAllocatedCaterer = [...existingAllocatedCountByCaterer.entries()]
      .find(([catererId, allocatedCount]) => allocatedCount > 0 && !capacityCatererSet.has(catererId));
    if (removedAllocatedCaterer) {
      return { error: 'Caterers with existing student allocations cannot be removed from this period' };
    }

    catererCapacities = catererCapacities.map((entry) => ({
      ...entry,
      allocatedCount: existingAllocatedCountByCaterer.get(entry.catererId) || 0,
    }));

    const overAllocatedCapacity = catererCapacities.find((entry) => entry.allocatedCount > entry.maxStudentCount);
    if (overAllocatedCapacity) {
      return { error: 'Caterer capacity cannot be lower than its current allocated student count' };
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

    const totalCapacity = catererCapacities.reduce((sum, entry) => sum + entry.maxStudentCount, 0);
    if (totalCapacity <= eligibleStudentCount) {
      return { error: 'Total caterer capacity must be greater than the eligible student count' };
    }

    return {
      data: {
        startDate,
        endDate,
        allocationStartAt,
        allocationEndAt,
        catererIds,
        catererCapacities,
        mealSlots,
        rebateSettings,
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

    try {
      await catererService.ensureCatererLogins(validation.data.catererIds);
    } catch (error) {
      return badRequest(error.message || 'Unable to create caterer logins for selected caterers');
    }

    const period = await new this.model(validation.data).save();
    const populatedPeriod = await this.model
      .findById(period._id)
      .populate({ path: 'catererIds', select: 'name email' })
      .lean();

    return success(serializePeriod(populatedPeriod, validation.data.eligibleStudentCount), 201, 'Dining period created successfully');
  }

  async updateDiningPeriod(periodId, payload) {
    const existingPeriod = await this.model.findById(periodId).lean();

    if (!existingPeriod) {
      return notFound('Dining period');
    }

    const validation = await this.validatePeriodPayload(payload, existingPeriod);

    if (validation.error) {
      return badRequest(validation.error);
    }

    try {
      await catererService.ensureCatererLogins(validation.data.catererIds);
    } catch (error) {
      return badRequest(error.message || 'Unable to create caterer logins for selected caterers');
    }

    const updatedPeriod = await this.model
      .findByIdAndUpdate(periodId, validation.data, { new: true, runValidators: true })
      .populate({ path: 'catererIds', select: 'name email' })
      .lean();

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
