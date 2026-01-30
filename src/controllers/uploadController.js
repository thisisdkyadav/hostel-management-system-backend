/**
 * Upload Controller
 * Handles HTTP requests for file upload operations.
 * All business logic delegated to uploadService.
 * 
 * @module controllers/upload
 */

import { uploadService } from '../services/upload.service.js';

/**
 * Get file from request (supports both single file and files array)
 * @private
 */
const getFileFromRequest = (req) => {
  return req.file || (Array.isArray(req.files) && req.files.length > 0 ? req.files[0] : undefined);
};

/**
 * Upload profile image
 */
export const uploadProfileImage = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await uploadService.uploadProfileImage({
      userId,
      userRole: req.user.role,
      currentUserId: req.user._id,
      file: req.file,
    });

    if (!result.success) {
      return res.status(result.statusCode).json({ error: result.message });
    }

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
};

/**
 * Upload student ID card
 */
export const uploadStudentIdCard = async (req, res) => {
  try {
    const { side } = req.params;
    const result = await uploadService.uploadStudentIdCard({
      userId: req.user._id,
      side,
      file: req.file,
    });

    if (!result.success) {
      return res.status(result.statusCode).json({ error: result.message });
    }

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
};

/**
 * Upload H2 form PDF
 */
export const h2FormPDF = async (req, res) => {
  try {
    const result = await uploadService.uploadH2FormPDF({
      userId: req.user?._id,
      file: getFileFromRequest(req),
    });

    if (!result.success) {
      return res.status(result.statusCode).json({ error: result.message });
    }

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
};

/**
 * Upload payment screenshot
 */
export const uploadPaymentScreenshot = async (req, res) => {
  try {
    const result = await uploadService.uploadPaymentScreenshot({
      userId: req.user?._id,
      file: getFileFromRequest(req),
    });

    if (!result.success) {
      return res.status(result.statusCode).json({ error: result.message });
    }

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
};

/**
 * Upload lost and found image
 */
export const uploadLostAndFoundImage = async (req, res) => {
  try {
    const result = await uploadService.uploadLostAndFoundImage({
      userId: req.user?._id,
      file: getFileFromRequest(req),
    });

    if (!result.success) {
      return res.status(result.statusCode).json({ error: result.message });
    }

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
};

/**
 * Upload certificate
 */
export const uploadCertificate = async (req, res) => {
  try {
    const result = await uploadService.uploadCertificate({
      userId: req.user?._id,
      file: getFileFromRequest(req),
    });

    if (!result.success) {
      return res.status(result.statusCode).json({ error: result.message });
    }

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
};
