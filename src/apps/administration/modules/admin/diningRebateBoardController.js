/**
 * Rebate board (Admin + Dining Office): rebates by dining period, and
 * office-side create / edit / archive / restore. Logic lives in
 * services/dining/rebate-board.service.js.
 */

import { asyncHandler } from '../../../../utils/index.js';
import {
  archiveBoardRebate,
  createBoardRebates,
  getRebateBoardHistory,
  getRebateBoardItem,
  getRebateBoardList,
  getRebateBoardOverview,
  previewBoardRebate,
  restoreBoardRebate,
  searchRebateStudents,
  updateBoardRebate,
} from '../../../../services/dining/rebate-board.service.js';

const send = (res, result) => {
  res.status(result.statusCode).json({ success: result.success, message: result.message, data: result.data });
};

export const getRebateOverview = asyncHandler(async (req, res) => send(res, await getRebateBoardOverview({ query: req.query })));
export const getRebateList = asyncHandler(async (req, res) => send(res, await getRebateBoardList({ query: req.query })));
export const getRebateStudents = asyncHandler(async (req, res) => send(res, await searchRebateStudents({ query: req.query })));
export const previewRebate = asyncHandler(async (req, res) => send(res, await previewBoardRebate({ payload: req.body || {} })));
export const createRebates = asyncHandler(async (req, res) => send(res, await createBoardRebates({ payload: req.body || {}, user: req.user })));
export const getRebate = asyncHandler(async (req, res) => send(res, await getRebateBoardItem({ rebateId: req.params.id })));
export const getRebateHistory = asyncHandler(async (req, res) => send(res, await getRebateBoardHistory({ rebateId: req.params.id })));
export const updateRebate = asyncHandler(async (req, res) => send(res, await updateBoardRebate({ rebateId: req.params.id, payload: req.body || {}, user: req.user })));
export const archiveRebate = asyncHandler(async (req, res) => send(res, await archiveBoardRebate({ rebateId: req.params.id, payload: req.body || {}, user: req.user })));
export const restoreRebate = asyncHandler(async (req, res) => send(res, await restoreBoardRebate({ rebateId: req.params.id, user: req.user })));
