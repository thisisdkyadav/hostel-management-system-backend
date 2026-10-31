/**
 * Dining Period Service
 * Handles caterer allocation period master-data for admin routes.
 */

import {
  ELIGIBILITY_MODES,
  ELIGIBILITY_MODE_ALL_ACTIVE,
  ELIGIBILITY_MODE_ALL_HOSTELLERS,
  ELIGIBILITY_MODE_CUSTOM,
  eligibleProfileFilter,
} from '../../../../services/dining/diningEligibility.js';
import mongoose from 'mongoose';
import {
  success,
  notFound,
  badRequest,
} from '../../../../services/base/index.js';
import { diningOwner } from '../../../../services/dining/diningOwner.service.js';
import { diningQueries } from '../../../../services/dining/diningQueries.service.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';
import { catererService } from './caterer.service.js';
import { allocationOwner } from '../../../../services/dining/allocationOwner.service.js';
import { tagOwner } from '../../../../services/dining/tagOwner.service.js';
import { tagQueries } from '../../../../services/dining/tagQueries.service.js';

const VALID_ELIGIBILITY_MODES = new Set(ELIGIBILITY_MODES);

// Eligible students per non-custom mode, for serializePeriod.
const countEligibleByMode = async () => {
  const [allActive, allHostellers] = await Promise.all([
    studentProfileQueries.countProfiles(eligibleProfileFilter({ eligibilityMode: ELIGIBILITY_MODE_ALL_ACTIVE })),
    studentProfileQueries.countProfiles(eligibleProfileFilter({ eligibilityMode: ELIGIBILITY_MODE_ALL_HOSTELLERS })),
  ]);
  return { [ELIGIBILITY_MODE_ALL_ACTIVE]: allActive, [ELIGIBILITY_MODE_ALL_HOSTELLERS]: allHostellers };
};
const DEFAULT_MEAL_SLOTS = [
  { name: 'Breakfast', startTime: '07:00', endTime: '10:00' },
  { name: 'Lunch', startTime: '12:00', endTime: '15:00' },
  { name: 'Dinner', startTime: '19:00', endTime: '22:00' },
];
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

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Keeps only overrides for known meals. Weekday entries equal to the default are
// dropped; date entries are kept since they may undo a weekday change.
const normalizeDaySlots = (slots = [], baseSlots = [], { dropUnchanged = true } = {}) => {
  const baseByName = new Map(baseSlots.map((slot) => [slot.name.toLowerCase(), slot]));
  return (Array.isArray(slots) ? slots : [])
    .map((slot) => {
      const base = baseByName.get(String(slot?.name || '').trim().toLowerCase());
      if (!base) return null;
      const closed = Boolean(slot.closed);
      const startTime = String(slot.startTime || base.startTime).trim();
      const endTime = String(slot.endTime || base.endTime).trim();
      if (dropUnchanged && !closed && startTime === base.startTime && endTime === base.endTime) return null;
      return { name: base.name, startTime, endTime, closed };
    })
    .filter(Boolean);
};

const normalizeWeekSchedule = (values = [], baseSlots = []) => (
  (Array.isArray(values) ? values : [])
    .map((entry) => ({ weekday: Number(entry?.weekday), slots: normalizeDaySlots(entry?.slots, baseSlots) }))
    .filter((entry) => Number.isInteger(entry.weekday) && entry.weekday >= 0 && entry.weekday <= 6 && entry.slots.length > 0)
);

const normalizeDateSchedule = (values = [], baseSlots = []) => (
  (Array.isArray(values) ? values : [])
    .map((entry) => ({ date: String(entry?.date || '').trim(), slots: normalizeDaySlots(entry?.slots, baseSlots, { dropUnchanged: false }) }))
    .filter((entry) => DATE_KEY_PATTERN.test(entry.date) && entry.slots.length > 0)
);

const getExistingAllocatedCountByCaterer = (period) => {
  const allocatedCountByCaterer = new Map();
  (Array.isArray(period?.catererCapacities) ? period.catererCapacities : []).forEach((entry) => {
    const catererId = String(entry?.catererId?._id || entry?.catererId || '');
    if (!catererId) return;

    allocatedCountByCaterer.set(catererId, Math.max(0, Number(entry?.allocatedCount || 0)));
  });
  return allocatedCountByCaterer;
};

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Server-local midnight starting the period's first service day. Period dates
 * are stored as UTC midnight of the calendar day (see services/dining/periodDay.js),
 * so the calendar day is read with UTC getters and re-anchored in local time.
 */
const getPeriodFirstDayStart = (startDate) => {
  const d = new Date(startDate);
  return new Date(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}T00:00:00`);
};

const toTime = (value) => (value ? new Date(value).getTime() : null);

const serializeAutoAllocation = (run) => {
  if (!run || !run.status) return null;
  return {
    status: run.status,
    startedAt: run.startedAt || null,
    completedAt: run.completedAt || null,
    unallocatedBefore: Number(run.unallocatedBefore || 0),
    assigned: Number(run.assigned || 0),
    leftOver: Number(run.leftOver || 0),
    byCaterer: (Array.isArray(run.byCaterer) ? run.byCaterer : []).map((entry) => ({
      catererId: String(entry.catererId?._id || entry.catererId || ''),
      assigned: Number(entry.assigned || 0),
    })),
    error: run.error || null,
  };
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
  // Registration disabled -> no self-registration window; admin assigns manually.
  if (period.registrationEnabled === false) return 'Manual';
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

const MAX_PERIOD_TAGS = 20;

/**
 * Allocation (period) tags of the period form: [{ id?, name, question?, defaultValue }].
 * Returns { tags } (normalized, ordered), { error }, or {} when the payload has
 * no `tags` key (an edit then leaves the period's tags untouched). Ids must be
 * tags of this period (`existingTags` = all of its period tags, archived too).
 */
const validatePeriodTags = (rawTags, existingTags = []) => {
  if (rawTags === undefined) return {};
  if (!Array.isArray(rawTags)) return { error: 'Tags must be a list' };
  if (rawTags.length > MAX_PERIOD_TAGS) return { error: `At most ${MAX_PERIOD_TAGS} tags are allowed per period` };
  const existingIds = new Set(existingTags.map((tag) => String(tag._id)));
  const seenNames = new Set();
  const seenIds = new Set();
  const tags = [];
  for (const raw of rawTags) {
    const name = String(raw?.name ?? '').trim();
    if (!name) return { error: 'Each tag needs a name' };
    if (name.length > 60) return { error: `Tag name "${name.slice(0, 20)}…" must be at most 60 characters` };
    const question = String(raw?.question ?? '').trim();
    if (question.length > 200) return { error: `The question for tag "${name}" must be at most 200 characters` };
    if (typeof raw?.defaultValue !== 'boolean') return { error: `Choose a default (yes or no) for tag "${name}"` };
    const lower = name.toLowerCase();
    if (seenNames.has(lower)) return { error: `Tag names must be unique within a period ("${name}")` };
    seenNames.add(lower);
    const id = raw?.id ? String(raw.id) : null;
    if (id) {
      if (!existingIds.has(id)) return { error: `Tag "${name}" does not belong to this period` };
      if (seenIds.has(id)) return { error: `Tag "${name}" is listed twice` };
      seenIds.add(id);
    }
    tags.push({ id, name, question, defaultValue: raw.defaultValue });
  }
  return { tags };
};

const serializePeriodTag = (tag, counts) => ({
  id: String(tag._id),
  name: tag.name,
  question: tag.question || '',
  defaultValue: tag.defaultValue ?? null,
  counts: counts || { yes: 0, no: 0, answered: 0 },
});

/** Live period tags (with answer counts) of many periods, in two queries: Map(periodId -> [tag]). */
const loadPeriodTags = async (periodIds = []) => {
  const byPeriod = new Map(periodIds.map((id) => [String(id), []]));
  if (!periodIds.length) return byPeriod;
  const tags = await tagQueries.findPeriodTags(periodIds);
  const counts = await tagQueries.countsByTag(tags.map((tag) => tag._id));
  tags.forEach((tag) => {
    const key = String(tag.periodId);
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key).push(serializePeriodTag(tag, counts.get(String(tag._id))));
  });
  return byPeriod;
};

const serializePeriod = (period, eligibleCounts = {}, tags = []) => {
  const caterers = Array.isArray(period.catererIds)
    ? period.catererIds.filter((item) => item && typeof item === 'object' && item.name).map(serializeCaterer)
    : [];
  const rawCatererIds = Array.isArray(period.catererIds)
    ? period.catererIds.map((item) => item?._id || item).filter(Boolean)
    : [];
  const eligibleRollNumbers = Array.isArray(period.eligibleRollNumbers) ? period.eligibleRollNumbers : [];
  const mealSlots = normalizeMealSlots(period.mealSlots);
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
    registrationEnabled: period.registrationEnabled !== false,
    allocationStartAt: period.allocationStartAt,
    allocationEndAt: period.allocationEndAt,
    notificationAt: period.notificationAt || null,
    notificationSentAt: period.notificationSentAt || null,
    autoAllocationAt: period.autoAllocationAt || null,
    autoAllocation: serializeAutoAllocation(period.autoAllocation),
    catererIds: rawCatererIds,
    caterers,
    catererCapacities,
    totalCapacity,
    eligibilityMode: period.eligibilityMode,
    eligibleRollNumbers,
    mealSlots,
    weekSchedule: normalizeWeekSchedule(period.weekSchedule, mealSlots),
    dateSchedule: normalizeDateSchedule(period.dateSchedule, mealSlots),
    // Rebate rules are global now (config `diningRebate`); periods no longer carry them.
    rebateSettings: null,
    dailyRate: Math.max(0, Number(period.dailyRate || 0)),
    eligibleStudentCount: period.eligibilityMode === ELIGIBILITY_MODE_CUSTOM
      ? eligibleRollNumbers.length
      : Number(eligibleCounts[period.eligibilityMode] || 0),
    isArchived: Boolean(period.isArchived),
    status: getPeriodStatus(period),
    allocationStatus: getAllocationStatus(period),
    tags,
    createdAt: period.createdAt,
    updatedAt: period.updatedAt,
  };
};

const formatPeriodDate = (value) => new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Non-archived periods may not overlap: neither their service dates (which
 * period a meal belongs to must be unambiguous) nor their student choice
 * windows (a student must only ever have one open choice). Service dates are
 * inclusive calendar days; windows are instants, so back-to-back is allowed.
 */
const findPeriodOverlapError = async ({ startDate, endDate, registrationEnabled, allocationStartAt, allocationEndAt, excludeId = null }) => {
  const notSelf = excludeId ? { _id: { $ne: excludeId } } : {};
  const dateClash = await diningQueries.findOnePeriod(
    { ...notSelf, isArchived: false, startDate: { $lte: endDate }, endDate: { $gte: startDate } },
    { lean: true, select: 'startDate endDate' }
  );
  if (dateClash) {
    return `Dining dates overlap another period (${formatPeriodDate(dateClash.startDate)} – ${formatPeriodDate(dateClash.endDate)})`;
  }

  if (!registrationEnabled || !allocationStartAt || !allocationEndAt) return null;
  const windowClash = await diningQueries.findOnePeriod(
    {
      ...notSelf,
      isArchived: false,
      registrationEnabled: { $ne: false },
      allocationStartAt: { $lt: allocationEndAt },
      allocationEndAt: { $gt: allocationStartAt },
    },
    { lean: true, select: 'startDate endDate' }
  );
  if (windowClash) {
    return `Caterer choice window overlaps the window of another period (${formatPeriodDate(windowClash.startDate)} – ${formatPeriodDate(windowClash.endDate)})`;
  }
  return null;
};

// A run still "running" this long after its claim is treated as dead.
const AUTO_ALLOCATION_STALE_MS = 60 * 60 * 1000;

const isAutoAllocationRearmable = (autoAllocation, now = Date.now()) => {
  if (autoAllocation?.status === 'failed') return true;
  if (autoAllocation?.status !== 'running') return false;
  const startedAt = toTime(autoAllocation.startedAt);
  return !startedAt || now - startedAt > AUTO_ALLOCATION_STALE_MS;
};

class DiningPeriodService {
  async validatePeriodPayload(payload = {}, existingPeriod = null) {
    const startDate = payload.startDate ? new Date(payload.startDate) : null;
    const endDate = payload.endDate ? new Date(payload.endDate) : null;
    const allocationStartAt = payload.allocationStartAt ? new Date(payload.allocationStartAt) : null;
    const allocationEndAt = payload.allocationEndAt ? new Date(payload.allocationEndAt) : null;
    const notificationAt = payload.notificationAt ? new Date(payload.notificationAt) : null;
    const rawCatererIds = normalizeObjectIds(payload.catererIds);
    let catererCapacities = normalizeCatererCapacities(payload.catererCapacities);
    const catererIds = rawCatererIds.length > 0
      ? rawCatererIds
      : catererCapacities.map((entry) => entry.catererId);
    const eligibilityMode = String(payload.eligibilityMode || ELIGIBILITY_MODE_ALL_HOSTELLERS).trim();
    const eligibleRollNumbers = normalizeRollNumbers(payload.eligibleRollNumbers);
    const mealSlots = normalizeMealSlots(payload.mealSlots);
    const weekSchedule = normalizeWeekSchedule(payload.weekSchedule, mealSlots);
    const dateSchedule = normalizeDateSchedule(payload.dateSchedule, mealSlots);
    const dailyRate = Math.max(0, Number(payload.dailyRate || 0));
    const autoAllocationRaw = payload.autoAllocationAt;
    const autoAllocationProvided = autoAllocationRaw !== undefined;
    const autoAllocationAt = autoAllocationRaw ? new Date(autoAllocationRaw) : null;
    // Optional: when disabled the period has no self-registration window and the
    // admin assigns caterers manually. Backward-compatible default is enabled.
    const registrationEnabled = payload.registrationEnabled !== false;

    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return { error: 'Start date and end date are required' };
    }

    if (registrationEnabled) {
      if (!allocationStartAt || Number.isNaN(allocationStartAt.getTime()) || !allocationEndAt || Number.isNaN(allocationEndAt.getTime())) {
        return { error: 'Allocation start time and end time are required' };
      }
      if (allocationStartAt > allocationEndAt) {
        return { error: 'Allocation start time must be before or equal to allocation end time' };
      }
      if (notificationAt && Number.isNaN(notificationAt.getTime())) {
        return { error: 'Invalid notification date and time' };
      }
      if (notificationAt && notificationAt > allocationEndAt) {
        return { error: 'Notification time must be before the allocation end time' };
      }
    }

    if (startDate > endDate) {
      return { error: 'Start date must be before or equal to end date' };
    }

    // Scheduled auto-allocation. Once it has completed (or is running) the time
    // is locked; a failed run, or one stuck "running" past the stale window
    // (process died mid-run), can be re-armed with a new time. Re-running is
    // safe: already-allocated students are skipped. Omitting the field on an
    // edit keeps whatever is stored.
    const existingAutoAllocationTime = toTime(existingPeriod?.autoAllocationAt);
    const autoAllocationRearmable = isAutoAllocationRearmable(existingPeriod?.autoAllocation);
    const autoAllocationLocked = Boolean(existingPeriod?.autoAllocation?.status) && !autoAllocationRearmable;
    let nextAutoAllocationAt = autoAllocationProvided ? autoAllocationAt : (existingPeriod?.autoAllocationAt || null);
    if (autoAllocationProvided && autoAllocationAt && Number.isNaN(autoAllocationAt.getTime())) {
      return { error: 'Invalid auto-allocation date and time' };
    }
    const autoAllocationChanged = autoAllocationProvided && toTime(autoAllocationAt) !== existingAutoAllocationTime;
    if (autoAllocationLocked) {
      if (autoAllocationChanged) {
        return { error: 'Auto-allocation has already run for this period; its time can no longer be changed' };
      }
      nextAutoAllocationAt = existingPeriod.autoAllocationAt || null;
    } else if (nextAutoAllocationAt) {
      if (registrationEnabled && allocationEndAt && nextAutoAllocationAt <= allocationEndAt) {
        return { error: 'Auto-allocation must be after the caterer choice window ends' };
      }
      if (nextAutoAllocationAt >= getPeriodFirstDayStart(startDate)) {
        return { error: 'Auto-allocation must be before the dining period starts' };
      }
      // Only a new or changed time must be in the future, so editing other
      // fields of a period whose stored time has passed is not blocked.
      if ((!existingPeriod || autoAllocationChanged) && nextAutoAllocationAt <= new Date()) {
        return { error: 'Auto-allocation time must be in the future' };
      }
    }
    // A re-armed (or cleared) failed/stale run starts over with no result.
    const resetAutoAllocation = autoAllocationRearmable && autoAllocationChanged;

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

    const invalidDaySlot = [...weekSchedule, ...dateSchedule]
      .flatMap((entry) => entry.slots)
      .find((slot) => !slot.closed && (!TIME_PATTERN.test(slot.startTime) || !TIME_PATTERN.test(slot.endTime)));
    if (invalidDaySlot) {
      return { error: `Day-specific timing for ${invalidDaySlot.name} must be valid HH:mm start/end time` };
    }

    if (!Number.isFinite(dailyRate) || dailyRate < 0) {
      return { error: 'Daily rate must be a non-negative amount' };
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

    const activeCatererCount = await diningQueries.countCaterers({
      _id: { $in: catererIds },
      isArchived: false,
    });

    if (activeCatererCount !== catererIds.length) {
      return { error: 'One or more selected caterers are unavailable or archived' };
    }

    let eligibleStudentCount = eligibilityMode === ELIGIBILITY_MODE_CUSTOM
      ? 0
      : await studentProfileQueries.countProfiles(eligibleProfileFilter({ eligibilityMode }));
    let resolvedRollNumbers = [];

    if (eligibilityMode === ELIGIBILITY_MODE_CUSTOM) {
      const activeStudents = await studentProfileQueries.findActiveByRollNumbers(eligibleRollNumbers, { select: 'rollNumber', lean: true });

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

    // Only meaningful for self-registration: students race for seats, so total
    // capacity must exceed demand. With manual assignment the admin controls the
    // fit directly (and can force-override), so the constraint is lifted.
    const totalCapacity = catererCapacities.reduce((sum, entry) => sum + entry.maxStudentCount, 0);
    if (registrationEnabled && totalCapacity <= eligibleStudentCount) {
      return { error: 'Total caterer capacity must be greater than the eligible student count' };
    }

    const overlapError = await findPeriodOverlapError({
      startDate, endDate, registrationEnabled, allocationStartAt, allocationEndAt, excludeId: existingPeriod?._id,
    });
    if (overlapError) return { error: overlapError };

    return {
      data: {
        startDate,
        endDate,
        registrationEnabled,
        allocationStartAt: registrationEnabled ? allocationStartAt : null,
        allocationEndAt: registrationEnabled ? allocationEndAt : null,
        notificationAt: registrationEnabled ? notificationAt : null,
        autoAllocationAt: nextAutoAllocationAt,
        ...(resetAutoAllocation ? { autoAllocation: null } : {}),
        catererIds,
        catererCapacities,
        mealSlots,
        weekSchedule,
        dateSchedule,
        dailyRate,
        eligibilityMode,
        eligibleRollNumbers: eligibilityMode === ELIGIBILITY_MODE_CUSTOM ? resolvedRollNumbers : [],
        eligibleStudentCount,
      },
    };
  }

  async getDiningPeriods(archive = 'false') {
    const [periods, eligibleCounts] = await Promise.all([
      diningQueries.findPeriods(
        { isArchived: archive === 'true' },
        {
          populate: { path: 'catererIds', select: 'name email' },
          sort: { startDate: -1, createdAt: -1 },
          lean: true,
        }
      ),
      countEligibleByMode(),
    ]);

    const tagsByPeriod = await loadPeriodTags(periods.map((period) => period._id));
    return success(periods.map((period) => serializePeriod(period, eligibleCounts, tagsByPeriod.get(String(period._id)) || [])));
  }

  async createDiningPeriod(payload, actor = null) {
    const validation = await this.validatePeriodPayload(payload);

    if (validation.error) {
      return badRequest(validation.error);
    }

    const tagValidation = validatePeriodTags(payload?.tags);
    if (tagValidation.error) return badRequest(tagValidation.error);

    try {
      await catererService.ensureCatererLogins(validation.data.catererIds);
    } catch (error) {
      return badRequest(error.message || 'Unable to create caterer logins for selected caterers');
    }

    const period = await diningOwner.createPeriod(validation.data);
    // Period creation is not transactional (diningOwner.createPeriod has no
    // session); the tags were validated above, so this sync only persists.
    if (tagValidation.tags?.length) {
      await tagOwner.syncPeriodTags(period._id, tagValidation.tags, { actor });
    }
    const populatedPeriod = await diningQueries.findPeriodById(period._id, {
      populate: { path: 'catererIds', select: 'name email' },
      lean: true,
    });

    const tagsByPeriod = await loadPeriodTags([period._id]);
    return success(serializePeriod(populatedPeriod, validation.data.eligibleStudentCount, tagsByPeriod.get(String(period._id)) || []), 201, 'Dining period created successfully');
  }

  async updateDiningPeriod(periodId, payload, actor = null) {
    const existingPeriod = await diningQueries.findPeriodById(periodId, { lean: true });

    if (!existingPeriod) {
      return notFound('Dining period');
    }

    const validation = await this.validatePeriodPayload(payload, existingPeriod);

    if (validation.error) {
      return badRequest(validation.error);
    }

    const tagValidation = payload?.tags === undefined
      ? {}
      : validatePeriodTags(payload.tags, await tagQueries.findTags({ kind: 'period', periodId: existingPeriod._id }));
    if (tagValidation.error) return badRequest(tagValidation.error);

    try {
      await catererService.ensureCatererLogins(validation.data.catererIds);
    } catch (error) {
      return badRequest(error.message || 'Unable to create caterer logins for selected caterers');
    }

    // Re-arm the scheduled notification when its time changes.
    const previousNotificationAt = existingPeriod.notificationAt ? new Date(existingPeriod.notificationAt).getTime() : null;
    const nextNotificationAt = validation.data.notificationAt ? validation.data.notificationAt.getTime() : null;
    const updates = previousNotificationAt === nextNotificationAt
      ? validation.data
      : { ...validation.data, notificationSentAt: null };

    // The capacity checks above used a read that may already be stale; the
    // owner re-checks them against the actual allocation rows and writes the
    // edit in one transaction, so a booking that lands meanwhile can't oversell.
    const applied = await allocationOwner.applyPeriodUpdate(periodId, updates);
    if (!applied.ok) {
      const messageByReason = {
        'period-not-found': 'Dining period not found',
        'caterer-has-allocations': 'Caterers with existing student allocations cannot be removed from this period',
        'below-allocated': 'Caterer capacity cannot be lower than its current allocated student count',
      };
      return applied.reason === 'period-not-found'
        ? notFound('Dining period')
        : badRequest(messageByReason[applied.reason] || 'Unable to update dining period');
    }

    // The period write runs in allocationOwner's own transaction, which takes
    // no callback; the tag sync gets its own transaction right after (inputs
    // were fully validated above). `tags` omitted = leave tags untouched.
    if (tagValidation.tags) {
      await tagOwner.syncPeriodTags(periodId, tagValidation.tags, { actor });
    }

    const updatedPeriod = await diningQueries.findPeriodById(periodId, {
      populate: { path: 'catererIds', select: 'name email' },
      lean: true,
    });

    const tagsByPeriod = await loadPeriodTags([updatedPeriod._id]);
    return success(serializePeriod(updatedPeriod, validation.data.eligibleStudentCount, tagsByPeriod.get(String(updatedPeriod._id)) || []), 200, 'Dining period updated successfully');
  }

  async changeArchiveStatus(periodId, status) {
    if (!status) {
      const period = await diningQueries.findPeriodById(periodId, { lean: true });
      if (!period) return notFound('Dining period');
      const overlapError = await findPeriodOverlapError({
        ...period, registrationEnabled: period.registrationEnabled !== false, excludeId: period._id,
      });
      if (overlapError) return badRequest(`Cannot unarchive: ${overlapError.charAt(0).toLowerCase()}${overlapError.slice(1)}`);
    }

    const updatedPeriod = await diningOwner.updatePeriodById(
      periodId,
      { isArchived: Boolean(status) },
      { new: true, populate: { path: 'catererIds', select: 'name email' }, lean: true }
    );

    if (!updatedPeriod) {
      return notFound('Dining period');
    }

    const [eligibleCounts, tagsByPeriod] = await Promise.all([
      countEligibleByMode(),
      loadPeriodTags([updatedPeriod._id]),
    ]);

    return success(
      serializePeriod(updatedPeriod, eligibleCounts, tagsByPeriod.get(String(updatedPeriod._id)) || []),
      200,
      updatedPeriod.isArchived ? 'Dining period archived successfully' : 'Dining period unarchived successfully',
    );
  }
}

export const diningPeriodService = new DiningPeriodService();
export default diningPeriodService;
