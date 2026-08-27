/**
 * Student-journey HTTP simulator.
 * Dining reads/writes hit sim_* collections. Dashboard uses live reads
 * and never writes the student dashboard cache. Sessions live in sim Redis.
 */
import mongoose from 'mongoose';
import { success, notFound, badRequest, forbidden } from '../../services/base/index.js';
import { studentProfileQueries } from '../../services/student/studentProfileQueries.service.js';
import { profilesSelfService } from '../students/modules/profiles-self/profiles-self.service.js';
import { getSessionRedisClient } from '../../services/session/redisSessionClient.js';
import { simDiningQueries } from './simDiningQueries.service.js';
import { simAllocationOwner, simDiningOwner } from './simDiningOwner.service.js';

const ELIGIBILITY_MODE_ALL_ACTIVE = 'all-active';
const ELIGIBILITY_MODE_CUSTOM = 'custom';

const stats = {
  dashboard: 0,
  portal: 0,
  rebates: 0,
  billing: 0,
  select: 0,
  assigned: 0,
  moved: 0,
  unchanged: 0,
  full: 0,
  contention: 0,
  failed: 0,
};

export const getSimStats = () => ({ ...stats });

const bump = (key) => {
  stats[key] = (stats[key] || 0) + 1;
};

const normalizeRollNumber = (value = '') => String(value || '').trim().toUpperCase();

const getAllocationStatus = (period) => {
  const now = new Date();
  if (!period) return 'Unavailable';
  if (period.isArchived) return 'Archived';
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
    caterer:
      allocation.catererId && typeof allocation.catererId === 'object' && allocation.catererId.name
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

const getStudentProfileForUser = async (userId) => {
  return studentProfileQueries.findByUserId(userId, { select: '_id rollNumber status', lean: true });
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

const getStudentVisiblePeriod = async (profile) => {
  const now = new Date();
  return simDiningQueries.findOnePeriod(
    {
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
    },
    {
      populate: { path: 'catererIds', select: 'name email' },
      sort: { allocationEndAt: 1, startDate: 1 },
    },
  );
};

export const getSimPortalState = async (userId) => {
  bump('portal');
  const profile = await getStudentProfileForUser(userId);
  if (!profile) return notFound('Student profile');

  const now = new Date();
  const eligiblePeriodFilter = getEligibilityFilterForProfile(profile);
  const [currentPeriod, activeAllocationPeriod, upcomingAllocationPeriod] = await Promise.all([
    simDiningQueries.findOnePeriod(
      { ...eligiblePeriodFilter, startDate: { $lte: now }, endDate: { $gte: now } },
      { populate: { path: 'catererIds', select: 'name email' }, sort: { endDate: 1, startDate: 1 }, lean: true },
    ),
    simDiningQueries.findOnePeriod(
      {
        ...eligiblePeriodFilter,
        registrationEnabled: true,
        allocationStartAt: { $lte: now },
        allocationEndAt: { $gte: now },
      },
      {
        populate: { path: 'catererIds', select: 'name email' },
        sort: { allocationEndAt: 1, startDate: 1 },
        lean: true,
      },
    ),
    simDiningQueries.findOnePeriod(
      { ...eligiblePeriodFilter, registrationEnabled: true, allocationStartAt: { $gt: now } },
      {
        populate: { path: 'catererIds', select: 'name email' },
        sort: { allocationStartAt: 1, startDate: 1 },
        lean: true,
      },
    ),
  ]);

  const periodIds = [currentPeriod?._id, activeAllocationPeriod?._id, upcomingAllocationPeriod?._id].filter(Boolean);
  const uniquePeriodIds = [...new Set(periodIds.map((periodId) => String(periodId)))];
  const allocations =
    uniquePeriodIds.length > 0 ? await simDiningQueries.findUserAllocationsByPeriods(userId, uniquePeriodIds) : [];
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
  });
};

export const selectSimDiningCaterer = async (userId, catererId) => {
  bump('select');
  if (!mongoose.Types.ObjectId.isValid(catererId)) {
    bump('failed');
    return badRequest('Invalid caterer selected');
  }

  const profile = await getStudentProfileForUser(userId);
  if (!profile) {
    bump('failed');
    return notFound('Student profile');
  }

  const period = await getStudentVisiblePeriod(profile);
  if (!period) {
    bump('failed');
    return badRequest('No dining allocation period is open right now');
  }

  if (!isStudentEligibleForPeriod(period, profile)) {
    bump('failed');
    return forbidden('You are not eligible for this dining allocation period');
  }

  const result = await simAllocationOwner.assignStudent({
    periodId: period._id,
    studentUserId: userId,
    studentProfileId: profile._id,
    rollNumber: profile.rollNumber,
    catererId,
    force: false,
  });

  if (!result.ok) {
    if (result.reason === 'full') bump('full');
    else if (result.reason === 'contention') bump('contention');
    else bump('failed');

    const messageByReason = {
      full: 'This caterer is full. Please select another caterer.',
      'caterer-not-in-period': 'Selected caterer is not available in this period',
      contention: 'Seat availability changed. Please try again.',
    };
    return badRequest(messageByReason[result.reason] || 'Unable to select caterer');
  }

  bump(result.status || 'assigned');
  await getSimPortalState(userId);
  const message = result.status === 'unchanged' ? 'This caterer is already selected' : 'Caterer selected successfully';
  return success({ status: result.status }, 200, message);
};

export const listSimDiningRebates = async (userId) => {
  bump('rebates');
  const rebates = await simDiningQueries.findRebatesByUser(userId);
  return success({ rebates });
};

export const listSimDiningBilling = async (userId) => {
  bump('billing');
  const billingPeriods = await simDiningQueries.findBillingByUser(userId);
  return success({ billingPeriods });
};

export const getSimStudentDashboard = async (userId) => {
  bump('dashboard');
  return profilesSelfService.getStudentDashboard(userId, { skipCacheWrite: true });
};

export const seedSimDining = async (payload = {}) => {
  await simDiningOwner.deleteDiningData();

  const catererCount = Math.min(Math.max(Number(payload.catererCount) || 3, 1), 8);
  const maxStudentCount = Math.min(Math.max(Number(payload.maxStudentCount) || 2000, 1), 20000);
  const now = Date.now();

  const caterers = [];
  for (let i = 0; i < catererCount; i += 1) {
    const caterer = await simDiningOwner.createCaterer({
      name: `Sim Caterer ${i + 1}`,
      email: `sim-caterer-${i + 1}@sim.hms.local`,
    });
    caterers.push(caterer);
  }

  const period = await simDiningOwner.createPeriod({
    startDate: new Date(now - 24 * 60 * 60 * 1000),
    endDate: new Date(now + 30 * 24 * 60 * 60 * 1000),
    registrationEnabled: true,
    allocationStartAt: new Date(now - 60 * 60 * 1000),
    allocationEndAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
    catererIds: caterers.map((caterer) => caterer._id),
    catererCapacities: caterers.map((caterer) => ({
      catererId: caterer._id,
      maxStudentCount,
      allocatedCount: 0,
    })),
    dailyRate: 120,
    eligibilityMode: ELIGIBILITY_MODE_ALL_ACTIVE,
    isArchived: false,
  });

  return success({
    periodId: String(period._id),
    catererIds: caterers.map((caterer) => String(caterer._id)),
    maxStudentCount,
  }, 201, 'Sim dining period seeded');
};

const deleteKeysByMatch = async (client, match) => {
  let deleted = 0;
  const stream = client.scanStream({ match, count: 200 });
  const pending = [];

  await new Promise((resolve, reject) => {
    stream.on('data', (keys) => {
      if (!keys?.length) return;
      pending.push(
        client.del(...keys).then((count) => {
          deleted += Number(count || 0);
        }),
      );
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  await Promise.all(pending);
  return deleted;
};

export const resetSim = async () => {
  const dining = await simDiningOwner.deleteDiningData();
  const aes = await mongoose.connection.collection('sim_user_aes').deleteMany({});
  const redis = getSessionRedisClient();
  const redisDeleted = await deleteKeysByMatch(redis, 'sim:*');

  return success({
    dining,
    aesKeys: aes.deletedCount || 0,
    redisKeys: redisDeleted,
  }, 200, 'Simulation data reset');
};
