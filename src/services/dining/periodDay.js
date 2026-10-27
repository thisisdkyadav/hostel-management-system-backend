/**
 * Dining period dates are calendar days stored as UTC midnight of the date
 * ("2026-11-30" -> 2026-11-30T00:00:00Z). Comparing them to the current
 * INSTANT cuts the final day off at 05:30 IST, so "is this period running"
 * must compare against the current calendar day instead. The day is taken at
 * server-local midnight, the same bucketing meal scans use.
 */

const pad = (n) => String(n).padStart(2, '0');

/** The calendar day containing `instant`, in the stored period-date form. */
export const periodDay = (instant = new Date()) => {
  const d = new Date(instant);
  return new Date(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00.000Z`);
};

/** Mongo filter: periods whose service dates include the day of `instant`. */
export const coversDayFilter = (instant = new Date()) => {
  const day = periodDay(instant);
  return { startDate: { $lte: day }, endDate: { $gte: day } };
};
