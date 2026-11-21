/**
 * "Last week" turnout on the student's menu: for each meal of a menu day, the
 * share of the caterer's expected students who ate that meal on the same
 * weekday last week. Gives students a feel for how popular a meal is.
 *
 * Counted like the dining office's daily report: expected = allocated to the
 * caterer in the period covering that day, minus students away on an approved
 * rebate; ate = expected students with a verified scan at that caterer for
 * that meal. Read-only.
 *
 * A meal gets no figure (null) when the reference day was not a full past day
 * for that meal, the meal was not served, fewer than MIN_EXPECTED students
 * were expected (too small to mean much), or nobody was scanned at all (almost
 * always a scanner outage, not a meal nobody ate).
 */

import { diningQueries } from '../../../../services/dining/diningQueries.service.js';
import { allocationQueries } from '../../../../services/dining/allocationQueries.service.js';
import { rebateEligibleAllocations, rebateScopeFilter } from '../../../../services/dining/rebateScope.js';
import { getStudentMenu } from '../../../operations/modules/dining-menu/dining-menu.service.js';
import { idOf, dayKey, shiftDay, localDay, mealSlots } from '../../../operations/modules/dining-caterer/dining-caterer.service.js';

export const MIN_EXPECTED = 5;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;

// `${catererId}:${date}` -> { at, value }. Past days barely change; a late
// manual scan or rebate approval shows up within CACHE_MS.
const cache = new Map();

/** The same weekday a week before `date`, stepped back further until it is a finished day. */
export const referenceDay = (date, today) => {
  let ref = shiftDay(date, -7);
  while (ref >= today) ref = shiftDay(ref, -7);
  return ref;
};

const slotKeyOf = (name) => String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const coversDay = (period, date) => period.startDate < localDay(shiftDay(date, 1)) && period.endDate >= localDay(date);

/**
 * Per reference day for one caterer: { expected, open: Set(slotKey), ate: Map(slotKey -> count) },
 * or null when no period with this caterer covered the day.
 */
const computeCatererDays = async (catererId, dates) => {
  const from = dates[0];
  const to = dates[dates.length - 1];
  const periods = await diningQueries.findPeriods(
    { catererIds: catererId, startDate: { $lt: localDay(shiftDay(to, 1)) }, endDate: { $gte: localDay(from) } },
    { lean: true, sort: { isArchived: 1, startDate: -1, _id: -1 } },
  );
  const periodOf = new Map(dates.map((date) => [date, periods.find((period) => coversDay(period, date)) || null]));
  const used = [...new Map([...periodOf.values()].filter(Boolean).map((period) => [idOf(period), period])).values()];
  if (!used.length) return new Map(dates.map((date) => [date, null]));

  const rosters = await Promise.all(used.map((period) => allocationQueries.findAllocationsByPeriodAndCaterer(period._id, catererId)));
  const rosterOf = new Map(used.map((period, index) => [idOf(period), rosters[index]]));
  const eligible = rebateEligibleAllocations(rosters.flat()).map((row) => row.studentUserId);
  const rebateFilter = rebateScopeFilter([{ studentUserIds: eligible, fromKey: from, toKey: to }], { status: 'approved' });

  const [rebates, scans] = await Promise.all([
    rebateFilter ? diningQueries.findRebates(rebateFilter, { lean: true, select: 'studentUserId dateKeys' }) : [],
    // The catererId/scannedAt index serves this.
    diningQueries.findVerifications(
      { catererId, status: 'verified', scannedAt: { $gte: localDay(from), $lt: localDay(shiftDay(to, 1)) } },
      { select: 'studentUserId periodId mealSlotKey scannedAt' },
    ),
  ]);

  const awayOn = new Map();
  for (const rebate of rebates) {
    for (const key of rebate.dateKeys || []) {
      if (!awayOn.has(key)) awayOn.set(key, new Set());
      awayOn.get(key).add(idOf(rebate.studentUserId));
    }
  }
  // Unique students per day, period and meal.
  const ateSets = new Map();
  for (const scan of scans) {
    const key = `${dayKey(scan.scannedAt)}:${idOf(scan.periodId)}:${scan.mealSlotKey}`;
    if (!ateSets.has(key)) ateSets.set(key, new Set());
    ateSets.get(key).add(idOf(scan.studentUserId));
  }

  return new Map(dates.map((date) => {
    const period = periodOf.get(date);
    if (!period) return [date, null];
    const away = awayOn.get(date) || new Set();
    const expectedIds = new Set(
      rosterOf.get(idOf(period)).map((row) => idOf(row.studentUserId)).filter((id) => !away.has(id)),
    );
    const open = new Set(mealSlots(period, date).map((slot) => slot.key));
    const ate = new Map();
    for (const key of open) {
      const eaten = ateSets.get(`${date}:${idOf(period)}:${key}`) || new Set();
      ate.set(key, [...eaten].filter((id) => expectedIds.has(id)).length);
    }
    return [date, { expected: expectedIds.size, open, ate }];
  }));
};

/** Cached per-day turnout for one caterer and these reference days. */
const catererDays = async (catererId, dates) => {
  const now = Date.now();
  const result = new Map();
  const missing = [];
  for (const date of dates) {
    const hit = cache.get(`${catererId}:${date}`);
    if (hit && now - hit.at < CACHE_MS) result.set(date, hit.value);
    else missing.push(date);
  }
  if (missing.length) {
    const computed = await computeCatererDays(catererId, missing.sort());
    if (cache.size > CACHE_MAX) cache.clear();
    for (const [date, value] of computed) {
      cache.set(`${catererId}:${date}`, { at: now, value });
      result.set(date, value);
    }
  }
  return result;
};

/** Adds `lastWeek: { date, percent } | null` to every meal of resolved student menu days. */
export const addLastWeekTurnout = async (days, today) => {
  const wanted = new Map();
  for (const day of days) {
    if (!day.caterer?.id || !day.meals?.length) continue;
    if (!wanted.has(day.caterer.id)) wanted.set(day.caterer.id, new Set());
    wanted.get(day.caterer.id).add(referenceDay(day.date, today));
  }
  const byCaterer = new Map(await Promise.all(
    [...wanted].map(async ([catererId, dates]) => [catererId, await catererDays(catererId, [...dates].sort())]),
  ));

  return days.map((day) => {
    if (!day.meals?.length) return day;
    const ref = day.caterer?.id ? referenceDay(day.date, today) : null;
    const stats = ref ? byCaterer.get(day.caterer.id)?.get(ref) : null;
    return {
      ...day,
      meals: day.meals.map((meal) => {
        const key = slotKeyOf(meal.name);
        const ate = stats?.ate.get(key) || 0;
        const usable = meal.served !== false && stats && stats.open.has(key) && stats.expected >= MIN_EXPECTED && ate > 0;
        return { ...meal, lastWeek: usable ? { date: ref, percent: Math.round((100 * ate) / stats.expected) } : null };
      }),
    };
  });
};

/** The student's menu with last week's turnout per meal. */
export const getStudentMenuWithTurnout = async ({ userId, query }) => {
  const result = await getStudentMenu({ userId, query });
  if (!result.success || !result.data?.days) return result;
  return { ...result, data: { ...result.data, days: await addLastWeekTurnout(result.data.days, result.data.today) } };
};

/** Test hook: forget cached turnout. */
export const clearTurnoutCache = () => cache.clear();
