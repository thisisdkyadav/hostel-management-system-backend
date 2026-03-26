/**
 * Upload Service
 * Thin orchestration layer that validates HMS upload intent and delegates storage to the
 * dedicated storage service.
 */

import { storageClient } from '../../../../services/storage/storage.client.js';

const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const PDF_MIME_TYPES = ['application/pdf'];
const MIXED_MIME_TYPES = [...PDF_MIME_TYPES, ...IMAGE_MIME_TYPES];
const TEN_MB = 10 * 1024 * 1024;

const successResult = (data) => ({
  success: true,
  statusCode: 200,
  data,
});

const errorResult = (statusCode, message) => ({
  success: false,
  statusCode,
  message,
});

const sanitizeMimeMatch = (file, allowedMimeTypes = []) => {
  if (!file) {
    return errorResult(400, 'No file uploaded');
  }

  const originalName = String(file.originalname || '').toLowerCase();
  const mimetype = String(file.mimetype || '').toLowerCase();
  const isPdf = mimetype === 'application/pdf' || originalName.endsWith('.pdf');

  if (allowedMimeTypes.includes('application/pdf') && isPdf) {
    return { ok: true };
  }

  if (allowedMimeTypes.includes(mimetype)) {
    return { ok: true };
  }

  return errorResult(400, 'Uploaded file type is not allowed');
};

const validateSize = (file, maxSizeBytes) => {
  const size = Number(file?.size || file?.buffer?.length || 0);
  if (size > maxSizeBytes) {
    return errorResult(400, `Document size must be ${Math.floor(maxSizeBytes / (1024 * 1024))}MB or smaller`);
  }

  return { ok: true };
};

class UploadService {
  async _uploadWithPolicy({ file, policy, actorId, actorRole, entityHint = '' }) {
    try {
      const payload = await storageClient.upload({
        file,
        policy,
        actorId,
        actorRole,
        entityHint,
        sourceService: 'hms-backend',
      });

      return successResult({
        fileId: payload.file_id || payload.fileId,
        fileRef: payload.file_ref || payload.fileRef,
        url: payload.url,
        contentType: payload.content_type || payload.contentType,
        size: payload.size,
        originalName: payload.original_name || payload.originalName,
      });
    } catch (error) {
      return errorResult(502, error.message || 'Failed to upload file');
    }
  }

  async uploadProfileImage({ userId, userRole, currentUserId, file }) {
    if (userRole === 'Student' && userId !== currentUserId) {
      return errorResult(403, "You don't have permission to upload profile image for this user");
    }

    const mimeValidation = sanitizeMimeMatch(file, IMAGE_MIME_TYPES);
    if (!mimeValidation.ok) return mimeValidation;

    return this._uploadWithPolicy({
      file,
      policy: 'profile-image',
      actorId: currentUserId,
      actorRole: userRole,
      entityHint: userId,
    });
  }

  async uploadStudentIdCard({ userId, side, file }) {
    const mimeValidation = sanitizeMimeMatch(file, IMAGE_MIME_TYPES);
    if (!mimeValidation.ok) return mimeValidation;

    return this._uploadWithPolicy({
      file,
      policy: 'student-id-card',
      actorId: userId,
      actorRole: 'Student',
      entityHint: `${userId}:${side}`,
    });
  }

  async uploadH2FormPDF({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, PDF_MIME_TYPES);
    if (!mimeValidation.ok) return errorResult(400, 'Only PDF files are allowed');

    return this._uploadWithPolicy({
      file,
      policy: 'h2-form',
      actorId: userId,
      actorRole: 'Student',
    });
  }

  async uploadEventProposalPDF({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, PDF_MIME_TYPES);
    if (!mimeValidation.ok) return errorResult(400, 'Only PDF files are allowed');

    return this._uploadWithPolicy({
      file,
      policy: 'event-proposal-pdf',
      actorId: userId,
      actorRole: 'Gymkhana',
    });
  }

  async uploadEventChiefGuestPDF({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, PDF_MIME_TYPES);
    if (!mimeValidation.ok) return errorResult(400, 'Only PDF files are allowed');

    return this._uploadWithPolicy({
      file,
      policy: 'event-chief-guest-pdf',
      actorId: userId,
      actorRole: 'Gymkhana',
    });
  }

  async uploadEventBillPDF({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, PDF_MIME_TYPES);
    if (!mimeValidation.ok) return errorResult(400, 'Only PDF files are allowed');

    return this._uploadWithPolicy({
      file,
      policy: 'event-bill-pdf',
      actorId: userId,
      actorRole: 'Gymkhana',
    });
  }

  async uploadEventReportPDF({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, PDF_MIME_TYPES);
    if (!mimeValidation.ok) return errorResult(400, 'Only PDF files are allowed');

    return this._uploadWithPolicy({
      file,
      policy: 'event-report-pdf',
      actorId: userId,
      actorRole: 'Gymkhana',
    });
  }

  async uploadDisCoProcessPDF({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, PDF_MIME_TYPES);
    if (!mimeValidation.ok) return errorResult(400, 'Only PDF files are allowed');

    return this._uploadWithPolicy({
      file,
      policy: 'disco-process-pdf',
      actorId: userId,
      actorRole: 'Admin',
    });
  }

  async uploadPaymentScreenshot({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, IMAGE_MIME_TYPES);
    if (!mimeValidation.ok) {
      return errorResult(400, 'Only image files are allowed (png, jpg, jpeg, webp, gif)');
    }

    return this._uploadWithPolicy({
      file,
      policy: 'payment-screenshot',
      actorId: userId,
      actorRole: 'Student',
    });
  }

  async uploadLostAndFoundImage({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, IMAGE_MIME_TYPES);
    if (!mimeValidation.ok) {
      return errorResult(400, 'Only image files are allowed (png, jpg, jpeg, webp, gif)');
    }

    return this._uploadWithPolicy({
      file,
      policy: 'lost-and-found-image',
      actorId: userId,
      actorRole: 'Staff',
    });
  }

  async uploadCertificate({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, MIXED_MIME_TYPES);
    if (!mimeValidation.ok) return errorResult(400, 'Only PDF and image files are allowed');

    return this._uploadWithPolicy({
      file,
      policy: 'certificate',
      actorId: userId,
      actorRole: 'Admin',
    });
  }

  async uploadElectionNominationDocument({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, PDF_MIME_TYPES);
    if (!mimeValidation.ok) return errorResult(400, 'Only PDF files are allowed');

    const sizeValidation = validateSize(file, TEN_MB);
    if (!sizeValidation.ok) return sizeValidation;

    return this._uploadWithPolicy({
      file,
      policy: 'election-nomination-document',
      actorId: userId,
      actorRole: 'Student',
    });
  }

  async uploadOverallBestPerformerProofPDF({ userId, file }) {
    const mimeValidation = sanitizeMimeMatch(file, PDF_MIME_TYPES);
    if (!mimeValidation.ok) return errorResult(400, 'Only PDF files are allowed');

    return this._uploadWithPolicy({
      file,
      policy: 'overall-best-performer-proof-pdf',
      actorId: userId,
      actorRole: 'Student',
    });
  }
}

export const uploadService = new UploadService();
export default uploadService;
