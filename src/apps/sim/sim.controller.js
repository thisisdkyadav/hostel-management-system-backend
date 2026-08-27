import { asyncHandler } from '../../utils/index.js';
import {
  getSimPortalState,
  getSimStats,
  getSimStudentDashboard,
  listSimDiningBilling,
  listSimDiningRebates,
  resetSim,
  seedSimDining,
  selectSimDiningCaterer,
} from './sim.service.js';

const writeSim = (res, result, code) => {
  const ok = Boolean(result?.success);
  res.status(result.statusCode || (ok ? 200 : 400)).json({
    success: ok,
    message: result.message || null,
    data: {
      ok,
      code: code || (ok ? 'ok' : 'error'),
    },
    errors: null,
  });
};

const writeSimPayload = (res, result, code) => {
  const ok = Boolean(result?.success);
  res.status(result.statusCode || (ok ? 200 : 400)).json({
    success: ok,
    message: result.message || null,
    data: {
      ok,
      code: code || (ok ? 'ok' : 'error'),
      ...(result.data && typeof result.data === 'object' ? result.data : {}),
    },
    errors: null,
  });
};

export const seedDining = asyncHandler(async (req, res) => {
  const result = await seedSimDining(req.body || {});
  writeSimPayload(res, result, result.success ? 'seeded' : 'seed-failed');
});

export const resetSimulation = asyncHandler(async (req, res) => {
  const result = await resetSim();
  writeSimPayload(res, result, result.success ? 'reset' : 'reset-failed');
});

export const getStats = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    message: null,
    data: { ok: true, code: 'stats', ...getSimStats() },
    errors: null,
  });
});

export const getDashboard = asyncHandler(async (req, res) => {
  const result = await getSimStudentDashboard(req.user._id);
  writeSim(res, result, result.success ? 'dashboard' : 'dashboard-failed');
});

export const getPortal = asyncHandler(async (req, res) => {
  const result = await getSimPortalState(req.user._id);
  writeSim(res, result, result.success ? 'portal' : 'portal-failed');
});

export const getRebates = asyncHandler(async (req, res) => {
  const result = await listSimDiningRebates(req.user._id);
  writeSim(res, result, result.success ? 'rebates' : 'rebates-failed');
});

export const getBilling = asyncHandler(async (req, res) => {
  const result = await listSimDiningBilling(req.user._id);
  writeSim(res, result, result.success ? 'billing' : 'billing-failed');
});

export const selectCaterer = asyncHandler(async (req, res) => {
  const result = await selectSimDiningCaterer(req.user._id, req.body?.catererId);
  const code = result.success
    ? (result.data?.status || 'assigned')
    : (String(result.message || '').includes('full')
      ? 'full'
      : String(result.message || '').includes('changed')
        ? 'contention'
        : 'select-failed');
  writeSim(res, result, code);
});
