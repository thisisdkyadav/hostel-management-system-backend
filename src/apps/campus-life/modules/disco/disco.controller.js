import { disCoService } from './disco.service.js';
import { asyncHandler } from '../../../../utils/index.js';

// Helper for error format { message, error }
const sendWithError = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error });
  }
  res.status(result.statusCode).json(result.data);
};

export const addDisCoAction = asyncHandler(async (req, res) => {
  const result = await disCoService.addDisCoAction(req.body);
  sendWithError(res, result);
});

export const getDisCoActionsByStudent = asyncHandler(async (req, res) => {
  const result = await disCoService.getDisCoActionsByStudent(req.params.studentId);
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      error: result.error,
    });
  }
  res.status(result.statusCode).json(result.data);
});

export const updateDisCoAction = asyncHandler(async (req, res) => {
  const result = await disCoService.updateDisCoAction(req.params.disCoId, req.body);
  sendWithError(res, result);
});

export const deleteDisCoAction = asyncHandler(async (req, res) => {
  const result = await disCoService.deleteDisCoAction(req.params.disCoId);
  sendWithError(res, result);
});

export const submitProcessCase = asyncHandler(async (req, res) => {
  const result = await disCoService.submitProcessCase(req.body, req.user);
  sendWithError(res, result);
});

export const getMyProcessCases = asyncHandler(async (req, res) => {
  const result = await disCoService.getMyProcessCases(req.user._id);
  sendWithError(res, result);
});

export const getAdminProcessCases = asyncHandler(async (req, res) => {
  const result = await disCoService.getAdminProcessCases(req.query);
  sendWithError(res, result);
});

export const getProcessCaseById = asyncHandler(async (req, res) => {
  const result = await disCoService.getProcessCaseById(req.params.caseId, req.user);
  sendWithError(res, result);
});

export const reviewProcessCase = asyncHandler(async (req, res) => {
  const result = await disCoService.reviewProcessCase(req.params.caseId, req.body, req.user);
  sendWithError(res, result);
});

export const addCaseStatement = asyncHandler(async (req, res) => {
  const result = await disCoService.addCaseStatement(req.params.caseId, req.body, req.user);
  sendWithError(res, result);
});

export const removeCaseStatement = asyncHandler(async (req, res) => {
  const result = await disCoService.removeCaseStatement(
    req.params.caseId,
    req.params.statementId,
    req.user
  );
  sendWithError(res, result);
});

export const sendCaseEmail = asyncHandler(async (req, res) => {
  const result = await disCoService.sendCaseEmail(req.params.caseId, req.body, req.user);
  sendWithError(res, result);
});

export const uploadCommitteeMinutes = asyncHandler(async (req, res) => {
  const result = await disCoService.uploadCommitteeMinutes(req.params.caseId, req.body, req.user);
  sendWithError(res, result);
});

export const finalizeProcessCase = asyncHandler(async (req, res) => {
  const result = await disCoService.finalizeCase(req.params.caseId, req.body, req.user);
  sendWithError(res, result);
});
