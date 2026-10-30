/**
 * A student's own meals: today, meal by meal, and the last two weeks. Read-only.
 * Day keys and meal times follow the caterer meal records, so the student sees
 * exactly what the dining office sees.
 */

import { success, notFound } from '../../../../services/base/index.js';
import { diningQueries } from '../../../../services/dining/diningQueries.service.js';
import { allocationQueries } from '../../../../services/dining/allocationQueries.service.js';
import { coversDayFilter } from '../../../../services/dining/periodDay.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import {
  idOf, dayKey, shiftDay, dayKeys, localDay, mealSlots, mealState,
} from '../../../operations/modules/dining-caterer/dining-caterer.service.js';

export const HISTORY_DAYS = 14;

/** The period running today in which this student has a caterer. */
const currentAllocation = async (userId, now) => {
  const periods = await diningQueries.findPeriods(
    { isArchived: false, ...coversDayFilter(now) },
    { lean: true, sort: { startDate: -1, _id: -1 } }
  );
  if (!periods.length) return null;
  const allocations = await allocationQueries.findUserAllocationsByPeriods(userId, periods.map((period) => period._id));
  for (const period of periods) {
    const allocation = allocations.find((row) => idOf(row.periodId) === idOf(period));
    if (allocation) return { period, allocation };
  }
  return null;
};

export const getStudentDiningMeals = async (userId) => {
  const profile = await studentProfileQueries.findByUserId(userId, { select: '_id rollNumber', lean: true });
  if (!profile) return notFound('Student profile');

  const now = new Date();
  const today = dayKey(now);
  const found = await currentAllocation(userId, now);
  if (!found) return success({ today, period: null, caterer: null, mealSlots: [], todayMeals: [], days: [], summary: null });

  const { period, allocation } = found;
  const slots = mealSlots(period);
  const periodStart = dayKey(period.startDate);
  const joined = allocation.createdAt ? dayKey(allocation.createdAt) : periodStart;
  const first = [shiftDay(today, -(HISTORY_DAYS - 1)), periodStart, joined].sort().pop();
  const keys = dayKeys(first, today);

  const [scans, rebates] = await Promise.all([
    // The rollNumber/scannedAt index serves this; studentUserId keeps it to this student.
    diningQueries.findVerifications(
      { rollNumber: profile.rollNumber, studentUserId: userId, scannedAt: { $gte: localDay(first), $lt: localDay(shiftDay(today, 1)) } },
      { select: 'mealSlotKey status scannedAt source', sort: { scannedAt: 1 } }
    ),
    // Rebates are standalone: the student's own, on these days (all inside the current period).
    diningQueries.findRebates(
      { studentUserId: userId, status: { $in: ['approved', 'pending'] }, dateKeys: { $in: keys } },
      { lean: true, select: 'status dateKeys' }
    ),
  ]);

  const away = new Set();
  const awayPending = new Set();
  for (const rebate of rebates) {
    for (const key of rebate.dateKeys) (rebate.status === 'approved' ? away : awayPending).add(key);
  }
  const ate = new Map();
  const issue = new Map();
  for (const scan of scans) {
    const key = `${dayKey(scan.scannedAt)}:${scan.mealSlotKey}`;
    if (scan.status === 'verified') {
      if (!ate.has(key)) ate.set(key, scan);
    } else {
      issue.set(key, scan);
    }
  }

  const mealFor = (date, slot) => {
    const key = `${date}:${slot.key}`;
    const scan = ate.get(key);
    const state = mealState(date, slot, now);
    if (scan) return { status: 'ate', at: scan.scannedAt, source: scan.source };
    if (away.has(date)) return { status: 'away' };
    const problem = issue.get(key);
    const base = state === 'ended' ? 'missed' : state === 'serving' ? 'serving' : 'upcoming';
    return problem ? { status: base, issue: problem.status, issueAt: problem.scannedAt } : { status: base };
  };

  const days = keys.map((date) => ({
    date,
    away: away.has(date),
    awayPending: awayPending.has(date),
    meals: Object.fromEntries(slots.map((slot) => [slot.key, mealFor(date, slot)])),
  }));

  const summary = { ate: 0, missed: 0, away: 0 };
  for (const day of days) {
    for (const meal of Object.values(day.meals)) {
      if (meal.status === 'ate') summary.ate++;
      else if (meal.status === 'missed') summary.missed++;
      else if (meal.status === 'away') summary.away++;
    }
  }

  return success({
    today,
    period: { id: idOf(period), startDate: periodStart, endDate: dayKey(period.endDate) },
    caterer: allocation.catererId?.name ? { id: idOf(allocation.catererId), name: allocation.catererId.name } : null,
    mealSlots: slots,
    todayMeals: mealSlots(period, today).map((slot) => ({ ...slot, state: mealState(today, slot, now), ...mealFor(today, slot) })),
    days,
    summary,
  });
};
