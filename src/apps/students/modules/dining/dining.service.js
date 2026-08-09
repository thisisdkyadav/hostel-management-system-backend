/**
 * Student Dining Service
 * Handles student-facing caterer selection for active dining periods.
 */

import mongoose from 'mongoose';
import {
  success,
  notFound,
  badRequest,
  forbidden,
} from '../../../../services/base/index.js';
import { DiningPeriod } from '../../../../models/index.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { allocationOwner } from '../../../../services/dining/allocationOwner.service.js';
import { allocationQueries } from '../../../../services/dining/allocationQueries.service.js';
import {
  createStudentDiningRebate,
  getStudentDiningRebates,
} from '../../../../services/dining-rebate.service.js';
import { getStudentDiningBilling } from '../../../administration/modules/admin/dining-billing.service.js';

const ELIGIBILITY_MODE_ALL_ACTIVE = 'all-active';
const ELIGIBILITY_MODE_CUSTOM = 'custom';

const normalizeRollNumber = (value = '') => String(value || '').trim().toUpperCase();

const getAllocationStatus = (period) => {
  const now = new Date();
  if (!period) return 'Unavailable';
  if (period.isArchived) return 'Archived';
  // No self-registration window: the admin assigns caterers manually.
  if (period.registrationEnabled === false) return 'Manual';
  if (now < new Date(period.allocationStartAt)) return 'Not started';
  if (now > new Date(period.allocationEndAt)) return 'Closed';
  return 'Open';
};

const serializeCaterer = (caterer = {}) => ({
  id: caterer._id || caterer.id,
  name: caterer.name,
  email: caterer.email,
});

const serializeCapacity = (entry, catererMap = new Map()) => {
  const catererId = String(entry.catererId?._id || entry.catererId || '');
  const maxStudentCount = Number(entry.maxStudentCount || 0);
  const allocatedCount = Number(entry.allocatedCount || 0);

  return {
    catererId,
    caterer: catererMap.get(catererId) || null,
    maxStudentCount,
    allocatedCount,
    remainingSeats: Math.max(maxStudentCount - allocatedCount, 0),
    isFull: allocatedCount >= maxStudentCount,
  };
};

const serializeAllocation = (allocation = null) => {
  if (!allocation) return null;

  return {
    id: allocation._id || allocation.id,
    periodId: allocation.periodId,
    catererId: allocation.catererId?._id || allocation.catererId,
    caterer: allocation.catererId && typeof allocation.catererId === 'object' && allocation.catererId.name
      ? serializeCaterer(allocation.catererId)
      : null,
    selectedAt: allocation.selectedAt,
  };
};

const serializePortalPeriod = ({ period, allocation = null }) => {
  if (!period) return null;

  const caterers = Array.isArray(period.catererIds)
    ? period.catererIds.filter((item) => item && typeof item === 'object' && item.name).map(serializeCaterer)
    : [];
  const catererMap = new Map(caterers.map((caterer) => [String(caterer.id), caterer]));
  const catererCapacities = Array.isArray(period.catererCapacities)
    ? period.catererCapacities.map((entry) => serializeCapacity(entry, catererMap))
    : [];

  return {
    id: period._id || period.id,
    startDate: period.startDate,
    endDate: period.endDate,
    allocationStartAt: period.allocationStartAt,
    allocationEndAt: period.allocationEndAt,
    allocationStatus: getAllocationStatus(period),
    caterers,
    catererCapacities,
    rebateSettings: period.rebateSettings || null,
    selectedAllocation: serializeAllocation(allocation),
  };
};

const getEligibilityFilterForProfile = (profile = {}) => ({
  isArchived: false,
  $or: [
    { eligibilityMode: ELIGIBILITY_MODE_ALL_ACTIVE },
    {
      eligibilityMode: ELIGIBILITY_MODE_CUSTOM,
      eligibleRollNumbers: normalizeRollNumber(profile?.rollNumber),
    },
  ],
});

const mapAllocationsByPeriod = (allocations = []) => {
  const allocationByPeriod = new Map();
  allocations.forEach((allocation) => {
    const periodId = String(allocation.periodId?._id || allocation.periodId || '');
    if (periodId) allocationByPeriod.set(periodId, allocation);
  });
  return allocationByPeriod;
};

const getStudentProfileForUser = async (userId, session = null) => {
  return studentProfileQueries.findByUserId(userId, { select: '_id rollNumber status', session, lean: true });
};

const isStudentEligibleForPeriod = (period, profile) => {
  if (!period || !profile || profile.status !== 'Active') return false;
  if (period.eligibilityMode === ELIGIBILITY_MODE_ALL_ACTIVE) return true;
  if (period.eligibilityMode === ELIGIBILITY_MODE_CUSTOM) {
    const rollNumber = normalizeRollNumber(profile.rollNumber);
    return Array.isArray(period.eligibleRollNumbers) && period.eligibleRollNumbers.includes(rollNumber);
  }
  return false;
};

const getStudentVisiblePeriod = async (profile, session = null) => {
  const now = new Date();
  const query = DiningPeriod.findOne({
    isArchived: false,
    registrationEnabled: true,
    allocationStartAt: { $lte: now },
    allocationEndAt: { $gte: now },
    $or: [
      { eligibilityMode: ELIGIBILITY_MODE_ALL_ACTIVE },
      {
        eligibilityMode: ELIGIBILITY_MODE_CUSTOM,
        eligibleRollNumbers: normalizeRollNumber(profile?.rollNumber),
      },
    ],
  })
    .populate({ path: 'catererIds', select: 'name email' })
    .sort({ allocationEndAt: 1, startDate: 1 });

  if (session) query.session(session);
  return query;
};

export const getStudentDiningPortalState = async (userId) => {
  const profile = await getStudentProfileForUser(userId);
  if (!profile) return notFound('Student profile');

  const now = new Date();
  const eligiblePeriodFilter = getEligibilityFilterForProfile(profile);
  const [currentPeriod, activeAllocationPeriod, upcomingAllocationPeriod] = await Promise.all([
    DiningPeriod.findOne({
      ...eligiblePeriodFilter,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .populate({ path: 'catererIds', select: 'name email' })
      .sort({ endDate: 1, startDate: 1 })
      .lean(),
    DiningPeriod.findOne({
      ...eligiblePeriodFilter,
      registrationEnabled: true,
      allocationStartAt: { $lte: now },
      allocationEndAt: { $gte: now },
    })
      .populate({ path: 'catererIds', select: 'name email' })
      .sort({ allocationEndAt: 1, startDate: 1 })
      .lean(),
    DiningPeriod.findOne({
      ...eligiblePeriodFilter,
      registrationEnabled: true,
      allocationStartAt: { $gt: now },
    })
      .populate({ path: 'catererIds', select: 'name email' })
      .sort({ allocationStartAt: 1, startDate: 1 })
      .lean(),
  ]);

  const periodIds = [
    currentPeriod?._id,
    activeAllocationPeriod?._id,
    upcomingAllocationPeriod?._id,
  ].filter(Boolean);
  const uniquePeriodIds = [...new Set(periodIds.map((periodId) => String(periodId)))];
  const allocations = uniquePeriodIds.length > 0
    ? await allocationQueries.findUserAllocationsByPeriods(userId, uniquePeriodIds)
    : [];
  const allocationByPeriod = mapAllocationsByPeriod(allocations);
  const activeAllocation = activeAllocationPeriod
    ? allocationByPeriod.get(String(activeAllocationPeriod._id))
    : null;

  return success({
    canSelect: Boolean(activeAllocationPeriod && !activeAllocation),
    currentPeriod: serializePortalPeriod({
      period: currentPeriod,
      allocation: currentPeriod ? allocationByPeriod.get(String(currentPeriod._id)) : null,
    }),
    activeAllocationPeriod: serializePortalPeriod({
      period: activeAllocationPeriod,
      allocation: activeAllocation,
    }),
    upcomingAllocationPeriod: serializePortalPeriod({
      period: upcomingAllocationPeriod,
      allocation: upcomingAllocationPeriod ? allocationByPeriod.get(String(upcomingAllocationPeriod._id)) : null,
    }),
    period: serializePortalPeriod({
      period: activeAllocationPeriod,
      allocation: activeAllocation,
    }),
    message: activeAllocationPeriod
      ? 'Dining allocation is open'
      : 'No dining allocation period is open right now',
  });
};

export const selectStudentDiningCaterer = async (userId, catererId) => {
  if (!mongoose.Types.ObjectId.isValid(catererId)) {
    return badRequest('Invalid caterer selected');
  }

  const profile = await getStudentProfileForUser(userId);
  if (!profile) return notFound('Student profile');

  const period = await getStudentVisiblePeriod(profile);
  if (!period) return badRequest('No dining allocation period is open right now');

  if (!isStudentEligibleForPeriod(period, profile)) {
    return forbidden('You are not eligible for this dining allocation period');
  }

  // The seat counter + allocation row are updated atomically inside the owner
  // (capacity-guarded, race-safe); self-select never forces past a full caterer.
  const result = await allocationOwner.assignStudent({
    periodId: period._id,
    studentUserId: userId,
    studentProfileId: profile._id,
    rollNumber: profile.rollNumber,
    catererId,
    force: false,
  });

  if (!result.ok) {
    const messageByReason = {
      full: 'This caterer is full. Please select another caterer.',
      'caterer-not-in-period': 'Selected caterer is not available in this period',
      contention: 'Seat availability changed. Please try again.',
    };
    return badRequest(messageByReason[result.reason] || 'Unable to select caterer');
  }

  const message = result.status === 'unchanged' ? 'This caterer is already selected' : 'Caterer selected successfully';
  const refreshedPortalState = await getStudentDiningPortalState(userId);
  return success(refreshedPortalState.data, 200, message);
};

export const requestStudentDiningRebate = async (userId, payload = {}) => (
  createStudentDiningRebate({ userId, payload })
);

export const listStudentDiningRebates = async (userId) => (
  getStudentDiningRebates({ userId })
);

export const listStudentDiningBilling = async (userId) => (
  getStudentDiningBilling(userId)
);

export default {
  getStudentDiningPortalState,
  selectStudentDiningCaterer,
  requestStudentDiningRebate,
  listStudentDiningRebates,
  listStudentDiningBilling,
};
