import { certificateService } from './certificates.service.js';
import { asyncHandler } from '../../../../utils/controllerHelpers.js';

/**
 * Helper: Error format with error field
 */
const sendWithError = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error });
  }
  res.status(result.statusCode).json(result.data);
};

export const addCertificate = asyncHandler(async (req, res) => {
  const result = await certificateService.addCertificate(req.body);
  sendWithError(res, result);
});

export const getCertificatesByStudent = asyncHandler(async (req, res) => {
  const result = await certificateService.getCertificatesByStudent(req.params.studentId);
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      error: result.error,
    });
  }
  res.status(result.statusCode).json(result.data);
});

export const updateCertificate = asyncHandler(async (req, res) => {
  const result = await certificateService.updateCertificate(req.params.certificateId, req.body);
  sendWithError(res, result);
});

export const deleteCertificate = asyncHandler(async (req, res) => {
  const result = await certificateService.deleteCertificate(req.params.certificateId);
  sendWithError(res, result);
});
