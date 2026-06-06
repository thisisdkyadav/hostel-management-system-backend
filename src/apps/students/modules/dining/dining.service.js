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
import { DiningAllocation, DiningPeriod, StudentProfile } from '../../../../models/index.js';

const ELIGIBILITY_MODE_ALL_ACTIVE = 'all-active';
const ELIGIBILITY_MODE_CUSTOM = 'custom';
const MAX_CAPACITY_UPDATE_ATTEMPTS = 4;

const normalizeRollNumber = (value = '') => String(value || '').trim().toUpperCase();

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const getAllocationStatus = (period) => {
  const now = new Date();
  if (!period) return 'Unavailable';
  if (period.isArchived) return 'Archived';
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
  const query = StudentProfile.findOne({ userId }).select('_id rollNumber status');
  if (session) query.session(session);
  return query.lean();
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
      allocationStartAt: { $lte: now },
      allocationEndAt: { $gte: now },
    })
      .populate({ path: 'catererIds', select: 'name email' })
      .sort({ allocationEndAt: 1, startDate: 1 })
      .lean(),
    DiningPeriod.findOne({
      ...eligiblePeriodFilter,
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
    ? await DiningAllocation.find({
      periodId: { $in: uniquePeriodIds },
      studentUserId: userId,
    })
      .populate({ path: 'catererId', select: 'name email' })
      .lean()
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

const incrementCatererCapacity = async ({ periodId, catererId, session }) => {
  for (let attempt = 0; attempt < MAX_CAPACITY_UPDATE_ATTEMPTS; attempt += 1) {
    const period = await DiningPeriod.findById(periodId).session(session).lean();
    if (!period) return { success: false, message: 'Dining period not found' };

    const capacityEntry = (period.catererCapacities || []).find((entry) => String(entry.catererId) === String(catererId));
    if (!capacityEntry) return { success: false, message: 'Selected caterer is not available in this period' };

    const allocatedCount = Number(capacityEntry.allocatedCount || 0);
    const maxStudentCount = Number(capacityEntry.maxStudentCount || 0);

    if (allocatedCount >= maxStudentCount) {
      return { success: false, message: 'This caterer is full. Please select another caterer.' };
    }

    const updateResult = await DiningPeriod.updateOne(
      {
        _id: periodId,
        catererCapacities: {
          $elemMatch: {
            catererId: toObjectId(catererId),
            allocatedCount,
          },
        },
      },
      {
        $inc: { 'catererCapacities.$.allocatedCount': 1 },
      },
      { session },
    );

    if (updateResult.modifiedCount === 1) {
      return { success: true };
    }
  }

  return { success: false, message: 'Seat availability changed. Please try again.' };
};

const decrementCatererCapacity = async ({ periodId, catererId, session }) => {
  await DiningPeriod.updateOne(
    {
      _id: periodId,
      catererCapacities: {
        $elemMatch: {
          catererId: toObjectId(catererId),
          allocatedCount: { $gt: 0 },
        },
      },
    },
    {
      $inc: { 'catererCapacities.$.allocatedCount': -1 },
    },
    { session },
  );
};

export const selectStudentDiningCaterer = async (userId, catererId) => {
  if (!mongoose.Types.ObjectId.isValid(catererId)) {
    return badRequest('Invalid caterer selected');
  }

  const session = await mongoose.startSession();
  let responsePayload = null;

  try {
    await session.withTransaction(async () => {
      const profile = await getStudentProfileForUser(userId, session);
      if (!profile) {
        responsePayload = notFound('Student profile');
        return;
      }

      const period = await getStudentVisiblePeriod(profile, session);
      if (!period) {
        responsePayload = badRequest('No dining allocation period is open right now');
        return;
      }

      if (!isStudentEligibleForPeriod(period, profile)) {
        responsePayload = forbidden('You are not eligible for this dining allocation period');
        return;
      }

      const existingAllocation = await DiningAllocation.findOne({
        periodId: period._id,
        studentUserId: userId,
      }).session(session);

      if (existingAllocation && String(existingAllocation.catererId) === String(catererId)) {
        responsePayload = success({ selected: true }, 200, 'This caterer is already selected');
        return;
      }

      const incrementResult = await incrementCatererCapacity({
        periodId: period._id,
        catererId,
        session,
      });

      if (!incrementResult.success) {
        responsePayload = badRequest(incrementResult.message);
        return;
      }

      let allocation = existingAllocation;
      if (existingAllocation) {
        const previousCatererId = existingAllocation.catererId;
        existingAllocation.catererId = toObjectId(catererId);
        existingAllocation.selectedAt = new Date();
        allocation = await existingAllocation.save({ session });
        await decrementCatererCapacity({
          periodId: period._id,
          catererId: previousCatererId,
          session,
        });
      } else {
        allocation = await DiningAllocation.create([{
          periodId: period._id,
          studentUserId: userId,
          studentProfileId: profile._id,
          rollNumber: profile.rollNumber,
          catererId,
          selectedAt: new Date(),
        }], { session });
        allocation = allocation[0];
      }

      responsePayload = success({ selected: true }, 200, 'Caterer selected successfully');
    });

    if (!responsePayload?.success) {
      return responsePayload || badRequest('Unable to select caterer');
    }

    const refreshedPortalState = await getStudentDiningPortalState(userId);
    return success(refreshedPortalState.data, 200, responsePayload.message || 'Caterer selected successfully');
  } finally {
    await session.endSession();
  }
};

export default {
  getStudentDiningPortalState,
  selectStudentDiningCaterer,
};
