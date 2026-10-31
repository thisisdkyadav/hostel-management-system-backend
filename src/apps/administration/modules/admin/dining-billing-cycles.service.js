/**
 * Dining Billing Cycles
 * One billing cycle per dining period: who was eligible/allocated, who ate,
 * rebates, what was billed (derived: chargeable days x daily rate) and how the
 * mess fee (DiningBillingPeriod pots) stands. Read-only analytics.
 */

import mongoose from 'mongoose';
import { success, notFound, badRequest } from '../../../../services/base/index.js';
import { diningQueries } from '../../../../services/dining/diningQueries.service.js';
import { allocationQueries } from '../../../../services/dining/allocationQueries.service.js';
import { billingQueries } from '../../../../services/dining/billingQueries.service.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { listDayKeys, normalizeDay } from '../../../../services/dining/dining-rebate.service.js';
import { resolveMealSlotsForDay } from '../../../../services/dining/mealSchedule.js';
import { loadBillingPeriodAccounts } from './dining-billing.service.js';
import { allocationScopes, clipRebate, rebateScopeFilter } from '../../../../services/dining/rebateScope.js';

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const idOf = (value) => String(value?._id || value || '');
const slotKey = (name = '') => String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const runtimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const TIMEZONE = runtimeZone === 'Asia/Calcutta' ? 'Asia/Kolkata' : runtimeZone;

const cycleStatus = (period, today) => {
  if (period.isArchived) return 'Archived';
  if (today < normalizeDay(period.startDate)) return 'Upcoming';
  if (today > normalizeDay(period.endDate)) return 'Closed';
  return 'Open';
};

/** Calendar facts shared by list + detail. */
const cycleDays = (period, today) => {
  const startDay = normalizeDay(period.startDate);
  const endDay = normalizeDay(period.endDate);
  const allKeys = startDay && endDay ? listDayKeys(startDay, endDay) : [];
  const elapsedEnd = endDay < today ? endDay : today;
  const elapsedKeys = startDay && elapsedEnd >= startDay ? listDayKeys(startDay, elapsedEnd) : [];
  // Meals offered per elapsed day honours the day-by-day meal schedule.
  const mealsOfferedPerStudent = elapsedKeys.reduce((sum, key) => sum + resolveMealSlotsForDay(period, key).length, 0);
  return { allKeys, elapsedKeys, elapsedSet: new Set(elapsedKeys), mealsOfferedPerStudent };
};

const summarizeCycle = ({ period, today, allocationRows, stats, rebates, feePeriods }) => {
  const { allKeys, elapsedKeys, elapsedSet, mealsOfferedPerStudent } = cycleDays(period, today);
  const dailyRate = Math.max(0, Number(period.dailyRate || 0));
  const capacities = new Map((period.catererCapacities || []).map((entry) => [idOf(entry.catererId), Number(entry.maxStudentCount || 0)]));
  const caterers = (period.catererIds || []).map((caterer) => {
    const id = idOf(caterer);
    return { id, name: caterer?.name || 'Caterer', allocated: allocationRows.get(id) || 0, capacity: capacities.get(id) || 0 };
  });
  const allocated = caterers.reduce((sum, caterer) => sum + caterer.allocated, 0);
  const capacity = caterers.reduce((sum, caterer) => sum + caterer.capacity, 0);

  let approvedRebateDays = 0;
  let elapsedRebateDays = 0;
  let pendingRebates = 0;
  let approvedRebates = 0;
  const rebaters = new Set();
  rebates.forEach((rebate) => {
    if (rebate.status === 'pending') pendingRebates += 1;
    if (rebate.status !== 'approved') return;
    approvedRebates += 1;
    rebaters.add(idOf(rebate.studentUserId));
    (rebate.dateKeys || []).forEach((key) => {
      approvedRebateDays += 1;
      if (elapsedSet.has(key)) elapsedRebateDays += 1;
    });
  });

  const chargeableDays = Math.max(0, allocated * elapsedKeys.length - elapsedRebateDays);
  const projectedDays = Math.max(0, allocated * allKeys.length - approvedRebateDays);
  const mealsOffered = allocated * mealsOfferedPerStudent;

  return {
    id: idOf(period),
    startDate: period.startDate,
    endDate: period.endDate,
    status: cycleStatus(period, today),
    isArchived: Boolean(period.isArchived),
    dailyRate,
    totalDays: allKeys.length,
    elapsedDays: elapsedKeys.length,
    eligible: Number(period.eligibleStudentCount || 0),
    eligibilityMode: period.eligibilityMode,
    allocated,
    capacity,
    caterers,
    mealsServed: stats?.verified || 0,
    scanIssues: stats?.issues || 0,
    eaters: stats?.eaterCount || 0,
    mealsOffered,
    attendanceRate: mealsOffered > 0 ? round2(((stats?.verified || 0) / mealsOffered) * 100) : null,
    rebates: { approved: approvedRebates, pending: pendingRebates, approvedDays: approvedRebateDays, elapsedDays: elapsedRebateDays, students: rebaters.size },
    billedDays: chargeableDays,
    billedAmount: round2(chargeableDays * dailyRate),
    projectedAmount: round2(projectedDays * dailyRate),
    rebateSavings: round2(elapsedRebateDays * dailyRate),
    feePeriods: feePeriods.map((fee) => ({ id: idOf(fee), name: fee.name, isArchived: Boolean(fee.isArchived) })),
  };
};

export const getBillingCycles = async () => {
  const periods = await diningQueries.findPeriods({}, {
    populate: { path: 'catererIds', select: 'name' },
    sort: { startDate: -1 },
    lean: true,
  });
  if (!periods.length) return success([]);

  const periodIds = periods.map((period) => period._id);
  const [allocationCounts, verificationStats, rosterRows, feePeriods] = await Promise.all([
    allocationQueries.countAllocationsByPeriodsAndCaterer(periodIds),
    diningQueries.aggregateVerificationStatsByPeriods(periodIds),
    allocationQueries.findAllocationSummariesByPeriods(periodIds),
    billingQueries.findBillingPeriodsByDiningPeriods(periodIds),
  ]);
  // Rebates are standalone: each period gets its allocated students' rebates, clipped to its days.
  const scopes = allocationScopes(periods, rosterRows);
  const rebateFilter = rebateScopeFilter(scopes, { status: ['approved', 'pending'] });
  const rebates = rebateFilter ? await diningQueries.findRebates(rebateFilter, { select: 'studentUserId status dateKeys', lean: true }) : [];

  const allocationsByPeriod = new Map();
  allocationCounts.forEach(({ _id, count }) => {
    const periodKey = idOf(_id.periodId);
    if (!allocationsByPeriod.has(periodKey)) allocationsByPeriod.set(periodKey, new Map());
    allocationsByPeriod.get(periodKey).set(idOf(_id.catererId), count);
  });
  const statsByPeriod = new Map(verificationStats.map((row) => [idOf(row._id), row]));
  const rebatesByPeriod = new Map(scopes.map((scope) => {
    const students = new Set(scope.studentUserIds.map(idOf));
    const own = rebates
      .filter((rebate) => students.has(idOf(rebate.studentUserId)))
      .map((rebate) => clipRebate(rebate, scope.fromKey, scope.toKey))
      .filter((rebate) => rebate.dayCount > 0);
    return [scope.periodId, own];
  }));

  const today = normalizeDay(new Date());
  return success(periods.map((period) => {
    const key = idOf(period);
    return summarizeCycle({
      period,
      today,
      allocationRows: allocationsByPeriod.get(key) || new Map(),
      stats: statsByPeriod.get(key),
      rebates: rebatesByPeriod.get(key) || [],
      feePeriods: feePeriods.filter((fee) => (fee.diningPeriodIds || []).some((item) => idOf(item) === key)),
    });
  }));
};

export const getBillingCycle = async (periodId) => {
  if (!mongoose.Types.ObjectId.isValid(periodId)) return badRequest('Invalid dining period');
  const period = await diningQueries.findPeriodById(periodId, { populate: { path: 'catererIds', select: 'name' }, lean: true });
  if (!period) return notFound('Dining period');

  const objectId = period._id;
  const [allocations, meals, issues, feePeriods] = await Promise.all([
    allocationQueries.findCycleAllocations(objectId),
    diningQueries.aggregateCycleMeals(objectId, TIMEZONE),
    diningQueries.countCycleIssues(objectId),
    billingQueries.findBillingPeriodsByDiningPeriods([objectId]),
  ]);
  // Rebates (any status) of the allocated students, clipped to this period's days.
  const [scope] = allocationScopes([period], allocations.map((row) => ({ periodId: objectId, studentUserId: row.studentUserId, unregistered: row.unregistered })));
  const rebateFilter = rebateScopeFilter([scope]);
  const rebates = (rebateFilter ? await diningQueries.findRebates(rebateFilter, { select: 'studentUserId status dateKeys', lean: true }) : [])
    .map((rebate) => clipRebate(rebate, scope.fromKey, scope.toKey));

  const today = normalizeDay(new Date());
  const userIds = [...new Set([...allocations.map((row) => idOf(row.studentUserId)), ...meals.map((row) => idOf(row.studentUserId))])].filter(Boolean);
  const activeFee = feePeriods.find((fee) => !fee.isArchived) || feePeriods[0] || null;
  const [profiles, feeAccounts] = await Promise.all([
    userIds.length ? studentProfileQueries.findBillingCycleStudentDetails(userIds) : [],
    activeFee ? loadBillingPeriodAccounts(activeFee) : null,
  ]);

  const profileByUser = new Map(profiles.map((profile) => [idOf(profile.userId), profile]));
  const feeByUser = new Map((feeAccounts?.accounts || []).map((account) => [idOf(account.studentUserId), account]));
  const catererNames = new Map((period.catererIds || []).map((caterer) => [idOf(caterer), caterer?.name || 'Caterer']));
  const { elapsedKeys, elapsedSet } = cycleDays(period, today);
  const dailyRate = Math.max(0, Number(period.dailyRate || 0));
  const slots = (period.mealSlots || []).map((slot) => ({ key: slotKey(slot.name), name: slot.name, startTime: slot.startTime, endTime: slot.endTime }));

  // Meals per student, and the day-by-day turnout series.
  const mealsByUser = new Map();
  const daily = new Map(elapsedKeys.map((key) => [key, { date: key, meals: {}, total: 0, onRebate: 0, offered: resolveMealSlotsForDay(period, key).map((slot) => slotKey(slot.name)) }]));
  meals.forEach(({ studentUserId, date, mealSlotKey }) => {
    const userKey = idOf(studentUserId);
    if (!mealsByUser.has(userKey)) mealsByUser.set(userKey, { total: 0, bySlot: {}, days: new Set(), last: '' });
    const entry = mealsByUser.get(userKey);
    entry.total += 1;
    entry.bySlot[mealSlotKey] = (entry.bySlot[mealSlotKey] || 0) + 1;
    entry.days.add(date);
    if (date > entry.last) entry.last = date;
    const day = daily.get(date);
    if (day) {
      day.meals[mealSlotKey] = (day.meals[mealSlotKey] || 0) + 1;
      day.total += 1;
    }
  });

  const rebatesByUser = new Map();
  rebates.forEach((rebate) => {
    const userKey = idOf(rebate.studentUserId);
    if (!rebatesByUser.has(userKey)) rebatesByUser.set(userKey, { approvedDays: 0, elapsedDays: 0, pending: 0, rejected: 0 });
    const entry = rebatesByUser.get(userKey);
    if (rebate.status === 'pending') entry.pending += 1;
    if (rebate.status === 'rejected') entry.rejected += 1;
    if (rebate.status !== 'approved') return;
    (rebate.dateKeys || []).forEach((key) => {
      entry.approvedDays += 1;
      if (elapsedSet.has(key)) {
        entry.elapsedDays += 1;
        const day = daily.get(key);
        if (day) day.onRebate += 1;
      }
    });
  });

  const students = allocations.map((allocation) => {
    const userKey = idOf(allocation.studentUserId);
    const profile = profileByUser.get(userKey);
    const mealEntry = mealsByUser.get(userKey);
    const rebateEntry = rebatesByUser.get(userKey) || { approvedDays: 0, elapsedDays: 0, pending: 0, rejected: 0 };
    const fee = feeByUser.get(userKey);
    const chargeableDays = Math.max(0, elapsedKeys.length - rebateEntry.elapsedDays);
    return {
      studentUserId: userKey,
      rollNumber: profile?.rollNumber || allocation.rollNumber || '',
      name: profile?.userId?.name || '',
      email: profile?.userId?.email || '',
      catererId: idOf(allocation.catererId),
      caterer: catererNames.get(idOf(allocation.catererId)) || 'Caterer',
      hostel: profile?.currentRoomAllocation?.hostelId?.name || 'No hostel',
      degree: profile?.degree || 'Unspecified',
      department: profile?.department || 'Unspecified',
      batch: profile?.batch ? String(profile.batch) : 'Unspecified',
      gender: profile?.gender || 'Unspecified',
      meals: mealEntry?.total || 0,
      mealsBySlot: mealEntry?.bySlot || {},
      daysEaten: mealEntry?.days.size || 0,
      lastMealDate: mealEntry?.last || null,
      rebateDays: rebateEntry.elapsedDays,
      approvedRebateDays: rebateEntry.approvedDays,
      pendingRebates: rebateEntry.pending,
      rejectedRebates: rebateEntry.rejected,
      chargeableDays,
      billed: round2(chargeableDays * dailyRate),
      fee: fee ? { paid: fee.allocatedAmount, charged: fee.totalCharged, balance: fee.balance, clearance: fee.clearance } : null,
    };
  }).sort((a, b) => a.rollNumber.localeCompare(b.rollNumber));

  const allocatedUsers = new Set(students.map((student) => student.studentUserId));
  const allocationRows = students.reduce((map, student) => map.set(student.catererId, (map.get(student.catererId) || 0) + 1), new Map());
  const summary = summarizeCycle({
    period,
    today,
    allocationRows,
    stats: {
      verified: meals.length,
      issues,
      eaterCount: mealsByUser.size,
    },
    rebates: rebates.filter((rebate) => rebate.status !== 'rejected'),
    feePeriods,
  });

  return success({
    cycle: summary,
    mealSlots: slots,
    feePeriod: activeFee ? { id: idOf(activeFee), name: activeFee.name, summary: feeAccounts?.summary || null } : null,
    unallocatedMealStudents: [...mealsByUser.keys()].filter((key) => !allocatedUsers.has(key)).length,
    daily: [...daily.values()],
    students,
  });
};

export default { getBillingCycles, getBillingCycle };
