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

export const markDisCoReminderDone = asyncHandler(async (req, res) => {
  const result = await disCoService.markReminderItemDone(
    req.params.disCoId,
    req.params.reminderItemId,
    req.user
  );
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

export const getAdminProcessCases = asyncHandler(async (req, res) => {
  const result = await disCoService.getAdminProcessCases(req.query);
  sendWithError(res, result);
});

export const getProcessCaseById = asyncHandler(async (req, res) => {
  const result = await disCoService.getProcessCaseById(req.params.caseId);
  sendWithError(res, result);
});

export const exportProcessCaseBundle = asyncHandler(async (req, res) => {
  const result = await disCoService.exportProcessCaseBundle(req.params.caseId);
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      error: result.error,
    });
  }

  const { buffer, fileName, contentType } = result.data || {};
  res.setHeader("Content-Type", contentType || "application/octet-stream");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${fileName || "disciplinary-case-export.zip"}"; filename*=UTF-8''${encodeURIComponent(fileName || "disciplinary-case-export.zip")}`
  );
  return res.status(result.statusCode || 200).send(buffer);
});

export const saveCaseStageTwo = asyncHandler(async (req, res) => {
  const result = await disCoService.saveCaseStageTwo(req.params.caseId, req.body, req.user);
  sendWithError(res, result);
});

export const sendCaseEmail = asyncHandler(async (req, res) => {
  const result = await disCoService.sendCaseEmail(req.params.caseId, req.body, req.user);
  sendWithError(res, result);
});

export const skipCaseEmail = asyncHandler(async (req, res) => {
  const result = await disCoService.skipCaseEmail(req.params.caseId, req.body, req.user);
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
