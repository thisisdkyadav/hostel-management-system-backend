import {
  getStudentDiningPortalState,
  listStudentDiningBilling,
  listStudentDiningRebates,
  requestStudentDiningRebate,
  previewStudentDiningRebateRequest,
  selectStudentDiningCaterer,
} from './dining.service.js';
import { getStudentDiningMeals } from './dining.meals.service.js';
import { getStudentMenu } from '../../../operations/modules/dining-menu/dining-menu.service.js';
import { answerStudentDiningTag, listStudentDiningTags } from './dining.tags.service.js';
import { asyncHandler } from '../../../../utils/index.js';

export const getDiningPortalState = asyncHandler(async (req, res) => {
  const result = await getStudentDiningPortalState(req.user._id);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const selectDiningCaterer = asyncHandler(async (req, res) => {
  const result = await selectStudentDiningCaterer(req.user._id, req.body?.catererId, req.body?.periodId, req.body?.tagAnswers);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const getDiningRebates = asyncHandler(async (req, res) => {
  const result = await listStudentDiningRebates(req.user._id);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const createDiningRebate = asyncHandler(async (req, res) => {
  const result = await requestStudentDiningRebate(req.user._id, req.body || {});
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const previewDiningRebate = asyncHandler(async (req, res) => {
  const result = await previewStudentDiningRebateRequest(req.user._id, req.body || {});
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const getDiningBilling = asyncHandler(async (req, res) => {
  const result = await listStudentDiningBilling(req.user._id);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const getDiningMeals = asyncHandler(async (req, res) => {
  const result = await getStudentDiningMeals(req.user._id);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const getDiningMenu = asyncHandler(async (req, res) => {
  const result = await getStudentMenu({ userId: req.user._id, query: req.query });
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const getDiningTags = asyncHandler(async (req, res) => {
  const result = await listStudentDiningTags(req.user._id);
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

export const answerDiningTag = asyncHandler(async (req, res) => {
  const result = await answerStudentDiningTag(req.user._id, req.params.tagId, req.body || {});
  res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});
