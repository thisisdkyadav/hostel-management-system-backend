/**
 * Dining Billing Service
 * Billing periods group dining periods; each student has a per-billing-period
 * money pot (DiningBillingAccount) topped up by admins via CSV (add/deduct/set).
 * Daily dining charges are DERIVED ON READ — never materialized — from the
 * contained dining periods, the student's caterer allocations, approved
 * rebates, and elapsed days. Balance = allocatedAmount - chargesToDate.
 */

import mongoose from 'mongoose';
import { success, notFound, badRequest } from '../../../../services/base/index.js';
import {
  DiningAllocation,
  DiningBillingAccount,
  DiningBillingPeriod,
  DiningPeriod,
  DiningRebate,
  StudentProfile,
  User,
} from '../../../../models/index.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';
import { listDayKeys, normalizeDay } from '../../../../services/dining-rebate.service.js';

const APPROVED_STATUS = 'approved';
const VALID_MODES = new Set(['add', 'deduct', 'set']);

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const normalizeRollNumber = (value = '') => String(value || '').trim().toUpperCase();

const normalizeIds = (values = []) => ([
  ...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => String(value?._id || value?.id || value || '').trim())
      .filter(Boolean),
  ),
]);

// ---------------------------------------------------------------------------
// Charge engine (pure)
// ---------------------------------------------------------------------------

const computePeriodCharge = ({ period, asOfDay, approvedRebateDayKeys }) => {
  const startDay = normalizeDay(period.startDate);
  const endDay = normalizeDay(period.endDate);
  if (!startDay || !endDay) return null;

  // Only elapsed days are charged: up to min(endDate, today).
  const elapsedEnd = endDay < asOfDay ? endDay : asOfDay;
  const dayKeys = listDayKeys(startDay, elapsedEnd); // [] for a future / not-yet-started period
  const totalDays = dayKeys.length;

  let rebateDays = 0;
  if (approvedRebateDayKeys && approvedRebateDayKeys.size > 0) {
    for (const key of dayKeys) {
      if (approvedRebateDayKeys.has(key)) rebateDays += 1;
    }
  }

  const chargeableDays = Math.max(0, totalDays - rebateDays);
  const dailyRate = Math.max(0, Number(period.dailyRate || 0));

  return {
    totalDays,
    rebateDays,
    chargeableDays,
    dailyRate,
    amount: round2(chargeableDays * dailyRate),
  };
};

/**
 * Pure: compute charges/balance/clearance for one student in one billing period.
 * @param {Object} args
 * @param {number} args.allocatedAmount
 * @param {Array}  args.diningPeriods            lean dining-period docs (startDate, endDate, dailyRate)
 * @param {Set}    args.participatingPeriodIds   period-id strings the student is allocated to
 * @param {Map}    args.rebateKeysByPeriod       periodId -> Set(approved dayKeys)
 * @param {Date}   args.asOf
 */
export const computeAccountCharges = ({
  allocatedAmount = 0,
  diningPeriods = [],
  participatingPeriodIds = new Set(),
  rebateKeysByPeriod = new Map(),
  asOf = new Date(),
} = {}) => {
  const asOfDay = normalizeDay(asOf);
  const perPeriod = [];
  let totalCharged = 0;

  for (const period of diningPeriods) {
    const periodId = String(period._id || period.id);
    if (!participatingPeriodIds.has(periodId)) continue;

    const charge = computePeriodCharge({
      period,
      asOfDay,
      approvedRebateDayKeys: rebateKeysByPeriod.get(periodId) || new Set(),
    });
    if (!charge) continue;

    totalCharged += charge.amount;
    perPeriod.push({
      periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      ...charge,
    });
  }

  totalCharged = round2(totalCharged);
  const allocated = round2(allocatedAmount);
  const balance = round2(allocated - totalCharged);

  return {
    allocatedAmount: allocated,
    totalCharged,
    balance,
    clearance: balance >= 0 ? 'cleared' : 'dues',
    perPeriod,
  };
};

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const getContainedPeriods = (billingPeriod) => (
  (billingPeriod.diningPeriodIds || []).filter((item) => item && typeof item === 'object')
);

const serializeBillingPeriod = (billingPeriod, summary = null) => {
  const diningPeriods = getContainedPeriods(billingPeriod);
  const starts = diningPeriods.map((p) => new Date(p.startDate)).filter((d) => !Number.isNaN(d.getTime()));
  const ends = diningPeriods.map((p) => new Date(p.endDate)).filter((d) => !Number.isNaN(d.getTime()));

  return {
    id: billingPeriod._id || billingPeriod.id,
    name: billingPeriod.name,
    note: billingPeriod.note || '',
    isArchived: Boolean(billingPeriod.isArchived),
    diningPeriodIds: diningPeriods.map((p) => String(p._id || p.id)),
    diningPeriods: diningPeriods.map((p) => ({
      id: String(p._id || p.id),
      startDate: p.startDate,
      endDate: p.endDate,
      dailyRate: Math.max(0, Number(p.dailyRate || 0)),
    })),
    startDate: starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null,
    endDate: ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null,
    summary,
    createdAt: billingPeriod.createdAt,
    updatedAt: billingPeriod.updatedAt,
  };
};

// ---------------------------------------------------------------------------
// Computed loaders (shared by admin list + detail)
// ---------------------------------------------------------------------------

/**
 * Loads every participating student (union of accounts ∪ allocations) for a
 * billing period and computes their derived charges/balance.
 */
const loadBillingPeriodAccounts = async (billingPeriod, asOf = new Date()) => {
  const diningPeriods = getContainedPeriods(billingPeriod);
  const periodIds = diningPeriods.map((p) => p._id);

  const [allocations, rebates, accountDocs] = await Promise.all([
    periodIds.length
      ? DiningAllocation.find({ periodId: { $in: periodIds } })
        .select('periodId studentUserId studentProfileId rollNumber').lean()
      : [],
    periodIds.length
      ? DiningRebate.find({ periodId: { $in: periodIds }, status: APPROVED_STATUS })
        .select('periodId studentUserId dateKeys').lean()
      : [],
    DiningBillingAccount.find({ billingPeriodId: billingPeriod._id }).lean(),
  ]);

  const studentMap = new Map();
  const ensureStudent = (userId) => {
    const key = String(userId);
    if (!studentMap.has(key)) {
      studentMap.set(key, {
        studentUserId: key,
        rollNumber: '',
        studentProfileId: null,
        allocatedAmount: 0,
        accountId: null,
        adjustmentCount: 0,
        participatingPeriodIds: new Set(),
        rebateKeysByPeriod: new Map(),
      });
    }
    return studentMap.get(key);
  };

  allocations.forEach((allocation) => {
    const student = ensureStudent(allocation.studentUserId);
    student.participatingPeriodIds.add(String(allocation.periodId));
    if (allocation.rollNumber) student.rollNumber = allocation.rollNumber;
    if (allocation.studentProfileId) student.studentProfileId = allocation.studentProfileId;
  });

  rebates.forEach((rebate) => {
    const student = ensureStudent(rebate.studentUserId);
    const periodId = String(rebate.periodId);
    if (!student.rebateKeysByPeriod.has(periodId)) student.rebateKeysByPeriod.set(periodId, new Set());
    const keySet = student.rebateKeysByPeriod.get(periodId);
    (Array.isArray(rebate.dateKeys) ? rebate.dateKeys : []).forEach((key) => keySet.add(key));
  });

  accountDocs.forEach((account) => {
    const student = ensureStudent(account.studentUserId);
    student.allocatedAmount = Number(account.allocatedAmount || 0);
    student.accountId = account._id;
    student.adjustmentCount = Array.isArray(account.adjustments) ? account.adjustments.length : 0;
    if (!student.rollNumber && account.rollNumber) student.rollNumber = account.rollNumber;
    if (!student.studentProfileId && account.studentProfileId) student.studentProfileId = account.studentProfileId;
  });

  const userIds = [...studentMap.keys()];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } }).select('name email').lean()
    : [];
  const userById = new Map(users.map((user) => [String(user._id), user]));

  const accounts = [...studentMap.values()].map((student) => {
    const computed = computeAccountCharges({
      allocatedAmount: student.allocatedAmount,
      diningPeriods,
      participatingPeriodIds: student.participatingPeriodIds,
      rebateKeysByPeriod: student.rebateKeysByPeriod,
      asOf,
    });
    const user = userById.get(student.studentUserId) || null;
    return {
      studentUserId: student.studentUserId,
      studentProfileId: student.studentProfileId,
      rollNumber: student.rollNumber,
      name: user?.name || '',
      email: user?.email || '',
      accountId: student.accountId,
      adjustmentCount: student.adjustmentCount,
      ...computed,
    };
  });

  accounts.sort((a, b) => String(a.rollNumber).localeCompare(String(b.rollNumber)));

  const summary = accounts.reduce((acc, account) => {
    acc.totalAllocated = round2(acc.totalAllocated + account.allocatedAmount);
    acc.totalCharged = round2(acc.totalCharged + account.totalCharged);
    acc.studentCount += 1;
    if (account.clearance === 'dues') acc.duesCount += 1;
    return acc;
  }, { totalAllocated: 0, totalCharged: 0, studentCount: 0, duesCount: 0 });
  summary.totalBalance = round2(summary.totalAllocated - summary.totalCharged);

  return { accounts, summary };
};

// ---------------------------------------------------------------------------
// Admin: billing-period CRUD
// ---------------------------------------------------------------------------

const validateBillingPeriodPayload = async (payload = {}) => {
  const name = String(payload.name || '').trim();
  if (!name) return { error: 'Billing period name is required' };

  const diningPeriodIds = normalizeIds(payload.diningPeriodIds);
  const invalidId = diningPeriodIds.find((id) => !mongoose.Types.ObjectId.isValid(id));
  if (invalidId) return { error: 'Invalid dining period selected' };

  if (diningPeriodIds.length > 0) {
    const existingCount = await DiningPeriod.countDocuments({ _id: { $in: diningPeriodIds } });
    if (existingCount !== diningPeriodIds.length) {
      return { error: 'One or more selected dining periods do not exist' };
    }
  }

  return {
    data: {
      name,
      diningPeriodIds,
      note: String(payload.note || '').trim(),
    },
  };
};

export const getBillingPeriods = async (archive = 'false') => {
  const billingPeriods = await DiningBillingPeriod
    .find({ isArchived: archive === 'true' })
    .populate({ path: 'diningPeriodIds', select: 'startDate endDate dailyRate' })
    .sort({ createdAt: -1 })
    .lean();

  const asOf = new Date();
  const serialized = await Promise.all(
    billingPeriods.map(async (billingPeriod) => {
      const { summary } = await loadBillingPeriodAccounts(billingPeriod, asOf);
      return serializeBillingPeriod(billingPeriod, summary);
    }),
  );

  return success(serialized);
};

export const createBillingPeriod = async (payload = {}) => {
  const validation = await validateBillingPeriodPayload(payload);
  if (validation.error) return badRequest(validation.error);

  const created = await new DiningBillingPeriod(validation.data).save();
  const populated = await DiningBillingPeriod.findById(created._id)
    .populate({ path: 'diningPeriodIds', select: 'startDate endDate dailyRate' })
    .lean();

  return success(serializeBillingPeriod(populated), 201, 'Billing period created successfully');
};

export const updateBillingPeriod = async (billingPeriodId, payload = {}) => {
  if (!mongoose.Types.ObjectId.isValid(billingPeriodId)) return badRequest('Invalid billing period');

  const validation = await validateBillingPeriodPayload(payload);
  if (validation.error) return badRequest(validation.error);

  const updated = await DiningBillingPeriod
    .findByIdAndUpdate(billingPeriodId, validation.data, { new: true, runValidators: true })
    .populate({ path: 'diningPeriodIds', select: 'startDate endDate dailyRate' })
    .lean();

  if (!updated) return notFound('Billing period');

  const { summary } = await loadBillingPeriodAccounts(updated);
  return success(serializeBillingPeriod(updated, summary), 200, 'Billing period updated successfully');
};

export const changeBillingPeriodArchiveStatus = async (billingPeriodId, status) => {
  if (!mongoose.Types.ObjectId.isValid(billingPeriodId)) return badRequest('Invalid billing period');

  const updated = await DiningBillingPeriod
    .findByIdAndUpdate(billingPeriodId, { isArchived: Boolean(status) }, { new: true })
    .populate({ path: 'diningPeriodIds', select: 'startDate endDate dailyRate' })
    .lean();

  if (!updated) return notFound('Billing period');

  return success(
    serializeBillingPeriod(updated),
    200,
    updated.isArchived ? 'Billing period archived successfully' : 'Billing period unarchived successfully',
  );
};

export const getBillingPeriodAccounts = async (billingPeriodId) => {
  if (!mongoose.Types.ObjectId.isValid(billingPeriodId)) return badRequest('Invalid billing period');

  const billingPeriod = await DiningBillingPeriod.findById(billingPeriodId)
    .populate({ path: 'diningPeriodIds', select: 'startDate endDate dailyRate' })
    .lean();

  if (!billingPeriod) return notFound('Billing period');

  const { accounts, summary } = await loadBillingPeriodAccounts(billingPeriod);

  return success({
    billingPeriod: serializeBillingPeriod(billingPeriod, summary),
    accounts,
  });
};

export const bulkUpdateBillingAccounts = async (billingPeriodId, { mode, entries = [], performedBy } = {}) => {
  if (!mongoose.Types.ObjectId.isValid(billingPeriodId)) return badRequest('Invalid billing period');

  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (!VALID_MODES.has(normalizedMode)) return badRequest('Invalid mode. Use add, deduct, or set');

  if (!Array.isArray(entries) || entries.length === 0) return badRequest('Please provide at least one row');
  if (entries.length > MAX_BULK_RECORDS) return badRequest(`Maximum ${MAX_BULK_RECORDS} rows are allowed per upload`);

  const billingPeriod = await DiningBillingPeriod.findById(billingPeriodId).lean();
  if (!billingPeriod) return notFound('Billing period');
  if (billingPeriod.isArchived) return badRequest('Cannot modify funds for an archived billing period');

  const normalized = entries.map((entry) => ({
    rollNumber: normalizeRollNumber(entry?.rollNumber),
    amount: Number(entry?.amount),
  }));

  const rollNumbers = [...new Set(normalized.map((entry) => entry.rollNumber).filter(Boolean))];
  const profiles = rollNumbers.length
    ? await StudentProfile.find({ rollNumber: { $in: rollNumbers } }).select('_id userId rollNumber').lean()
    : [];
  const profileByRoll = new Map(profiles.map((profile) => [profile.rollNumber, profile]));

  const skipped = [];
  let updated = 0;

  for (const entry of normalized) {
    if (!entry.rollNumber) {
      skipped.push({ rollNumber: '(blank)', reason: 'Missing roll number' });
      continue;
    }
    if (!Number.isFinite(entry.amount) || entry.amount < 0) {
      skipped.push({ rollNumber: entry.rollNumber, reason: 'Invalid amount' });
      continue;
    }
    const profile = profileByRoll.get(entry.rollNumber);
    if (!profile || !profile.userId) {
      skipped.push({ rollNumber: entry.rollNumber, reason: 'Roll number not found' });
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const account = await DiningBillingAccount.findOne({
      billingPeriodId,
      studentUserId: profile.userId,
    });
    const current = account ? Number(account.allocatedAmount || 0) : 0;
    let next;
    if (normalizedMode === 'add') next = current + entry.amount;
    else if (normalizedMode === 'deduct') next = current - entry.amount;
    else next = entry.amount;
    next = round2(next);

    const adjustment = {
      mode: normalizedMode,
      amount: round2(entry.amount),
      allocatedAfter: next,
      performedBy: performedBy || null,
      performedAt: new Date(),
    };

    if (account) {
      account.allocatedAmount = next;
      account.rollNumber = entry.rollNumber;
      account.studentProfileId = profile._id;
      account.adjustments.push(adjustment);
      // eslint-disable-next-line no-await-in-loop
      await account.save();
    } else {
      // eslint-disable-next-line no-await-in-loop
      await DiningBillingAccount.create({
        billingPeriodId,
        studentUserId: profile.userId,
        studentProfileId: profile._id,
        rollNumber: entry.rollNumber,
        allocatedAmount: next,
        adjustments: [adjustment],
      });
    }
    updated += 1;
  }

  return success(
    { updated, skipped, total: normalized.length },
    200,
    `${updated} account(s) updated${skipped.length ? `, ${skipped.length} skipped` : ''}`,
  );
};

// ---------------------------------------------------------------------------
// Student: billing overview
// ---------------------------------------------------------------------------

const computeStudentBillingForPeriod = async (billingPeriod, userId, asOf = new Date()) => {
  const diningPeriods = getContainedPeriods(billingPeriod);
  const periodIds = diningPeriods.map((p) => p._id);

  const [allocations, rebates, account] = await Promise.all([
    periodIds.length
      ? DiningAllocation.find({ studentUserId: userId, periodId: { $in: periodIds } }).select('periodId').lean()
      : [],
    periodIds.length
      ? DiningRebate.find({ studentUserId: userId, periodId: { $in: periodIds }, status: APPROVED_STATUS })
        .select('periodId dateKeys').lean()
      : [],
    DiningBillingAccount.findOne({ billingPeriodId: billingPeriod._id, studentUserId: userId }).lean(),
  ]);

  const participatingPeriodIds = new Set(allocations.map((allocation) => String(allocation.periodId)));
  const rebateKeysByPeriod = new Map();
  rebates.forEach((rebate) => {
    const periodId = String(rebate.periodId);
    if (!rebateKeysByPeriod.has(periodId)) rebateKeysByPeriod.set(periodId, new Set());
    const keySet = rebateKeysByPeriod.get(periodId);
    (Array.isArray(rebate.dateKeys) ? rebate.dateKeys : []).forEach((key) => keySet.add(key));
  });

  return computeAccountCharges({
    allocatedAmount: Number(account?.allocatedAmount || 0),
    diningPeriods,
    participatingPeriodIds,
    rebateKeysByPeriod,
    asOf,
  });
};

export const getStudentDiningBilling = async (userId) => {
  const profile = await StudentProfile.findOne({ userId }).select('_id').lean();
  if (!profile) return success({ billingPeriods: [] });

  const [accounts, allocations] = await Promise.all([
    DiningBillingAccount.find({ studentUserId: userId }).select('billingPeriodId').lean(),
    DiningAllocation.find({ studentUserId: userId }).select('periodId').lean(),
  ]);

  const billingPeriodIds = new Set(accounts.map((account) => String(account.billingPeriodId)));

  const allocationPeriodIds = allocations.map((allocation) => allocation.periodId);
  if (allocationPeriodIds.length > 0) {
    const matchingBillingPeriods = await DiningBillingPeriod
      .find({ isArchived: false, diningPeriodIds: { $in: allocationPeriodIds } })
      .select('_id').lean();
    matchingBillingPeriods.forEach((billingPeriod) => billingPeriodIds.add(String(billingPeriod._id)));
  }

  if (billingPeriodIds.size === 0) return success({ billingPeriods: [] });

  const billingPeriods = await DiningBillingPeriod
    .find({ _id: { $in: [...billingPeriodIds] }, isArchived: false })
    .populate({ path: 'diningPeriodIds', select: 'startDate endDate dailyRate' })
    .lean();

  const asOf = new Date();
  const result = await Promise.all(
    billingPeriods.map(async (billingPeriod) => {
      const computed = await computeStudentBillingForPeriod(billingPeriod, userId, asOf);
      const serialized = serializeBillingPeriod(billingPeriod);
      return {
        id: serialized.id,
        name: serialized.name,
        note: serialized.note,
        startDate: serialized.startDate,
        endDate: serialized.endDate,
        allocatedAmount: computed.allocatedAmount,
        totalCharged: computed.totalCharged,
        balance: computed.balance,
        clearance: computed.clearance,
        perPeriod: computed.perPeriod,
      };
    }),
  );

  result.sort((a, b) => {
    const aTime = a.startDate ? new Date(a.startDate).getTime() : 0;
    const bTime = b.startDate ? new Date(b.startDate).getTime() : 0;
    return bTime - aTime;
  });

  return success({ billingPeriods: result });
};

export default {
  computeAccountCharges,
  getBillingPeriods,
  createBillingPeriod,
  updateBillingPeriod,
  changeBillingPeriodArchiveStatus,
  getBillingPeriodAccounts,
  bulkUpdateBillingAccounts,
  getStudentDiningBilling,
};
