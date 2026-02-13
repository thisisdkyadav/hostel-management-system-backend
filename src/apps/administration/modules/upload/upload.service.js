/**
 * Upload Service
 * Contains all business logic for file upload operations.
 * 
 * @module services/upload
 */

import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import {
  AZURE_STORAGE_CONNECTION_STRING,
  AZURE_STORAGE_CONTAINER_NAME,
  AZURE_STORAGE_ACCOUNT_NAME,
  AZURE_STORAGE_ACCOUNT_KEY,
  AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID,
  USE_LOCAL_STORAGE,
} from '../../../../config/env.config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Azure storage setup
const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME);
const containerClientStudentId = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID);

// Local storage paths - 5 levels up from src/apps/administration/modules/upload/ to backend/uploads/
const uploadsBasePath = path.join(__dirname, '..', '..', '..', '..', '..', 'uploads');
const profileImagesPath = path.join(uploadsBasePath, 'profile-images');
const studentIdCardsPath = path.join(uploadsBasePath, 'student-id-cards');
const h2FormsPath = path.join(uploadsBasePath, 'h2-forms');
const eventProposalDocsPath = path.join(uploadsBasePath, 'event-proposal-docs');
const eventChiefGuestDocsPath = path.join(uploadsBasePath, 'event-chief-guest-docs');
const eventBillDocsPath = path.join(uploadsBasePath, 'event-bill-docs');
const eventReportDocsPath = path.join(uploadsBasePath, 'event-report-docs');
const disCoProcessDocsPath = path.join(uploadsBasePath, 'disco-process-docs');
const certificatesPath = path.join(uploadsBasePath, 'certificates');

// Ensure directories exist
if (USE_LOCAL_STORAGE) {
  [profileImagesPath, studentIdCardsPath, h2FormsPath, eventProposalDocsPath, eventChiefGuestDocsPath, eventBillDocsPath, eventReportDocsPath, disCoProcessDocsPath, certificatesPath].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

class UploadService {
  /**
   * Generate SAS URL for Azure blob
   * @private
   */
  _generateSasUrl(blockBlobClient, containerName, blobName) {
    const sharedKeyCredential = new StorageSharedKeyCredential(
      AZURE_STORAGE_ACCOUNT_NAME,
      AZURE_STORAGE_ACCOUNT_KEY
    );
    const expiryDate = new Date('2099-12-31');

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName,
        permissions: BlobSASPermissions.parse('r'),
        expiresOn: expiryDate,
      },
      sharedKeyCredential
    ).toString();

    return `${blockBlobClient.url}?${sasToken}`;
  }

  /**
   * Upload profile image
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadProfileImage({ userId, userRole, currentUserId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    if (userRole === 'Student' && userId !== currentUserId) {
      return {
        success: false,
        statusCode: 403,
        message: "You don't have permission to upload profile image for this user",
      };
    }

    const { originalname, buffer, mimetype } = file;
    const blobName = `${userId}-${originalname}`;

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId}-${Date.now()}-${originalname}`;
      const filepath = path.join(profileImagesPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/profile-images/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: mimetype },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload student ID card
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadStudentIdCard({ userId, side, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;
    const blobName = `${userId}-${side}-${originalname}`;

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId}-${side}-${Date.now()}-${originalname}`;
      const filepath = path.join(studentIdCardsPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/student-id-cards/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClientStudentId.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: mimetype },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload H2 form PDF
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadH2FormPDF({ userId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;

    // Basic validation for PDF
    const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return {
        success: false,
        statusCode: 400,
        message: 'Only PDF files are allowed',
      };
    }

    const timestamp = Date.now();
    const safeOriginal = path.parse(originalname).name.replace(/[^a-zA-Z0-9-_]/g, '_') + '.pdf';
    const blobName = `h2-forms/${userId}-${timestamp}-${safeOriginal}`;

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId}-${timestamp}-${safeOriginal}`;
      const filepath = path.join(h2FormsPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/h2-forms/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload event proposal PDF
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadEventProposalPDF({ userId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;

    // Basic validation for PDF
    const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return {
        success: false,
        statusCode: 400,
        message: 'Only PDF files are allowed',
      };
    }

    const timestamp = Date.now();
    const safeOriginal = path.parse(originalname).name.replace(/[^a-zA-Z0-9-_]/g, '_') + '.pdf';
    const blobName = `event-proposal-docs/${userId}-${timestamp}-${safeOriginal}`;

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId}-${timestamp}-${safeOriginal}`;
      const filepath = path.join(eventProposalDocsPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/event-proposal-docs/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload event chief guest PDF
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadEventChiefGuestPDF({ userId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;

    // Basic validation for PDF
    const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return {
        success: false,
        statusCode: 400,
        message: 'Only PDF files are allowed',
      };
    }

    const timestamp = Date.now();
    const safeOriginal = path.parse(originalname).name.replace(/[^a-zA-Z0-9-_]/g, '_') + '.pdf';
    const blobName = `event-chief-guest-docs/${userId}-${timestamp}-${safeOriginal}`;

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId}-${timestamp}-${safeOriginal}`;
      const filepath = path.join(eventChiefGuestDocsPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/event-chief-guest-docs/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload event bill PDF
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadEventBillPDF({ userId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;

    // Basic validation for PDF
    const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return {
        success: false,
        statusCode: 400,
        message: 'Only PDF files are allowed',
      };
    }

    const timestamp = Date.now();
    const safeOriginal = path.parse(originalname).name.replace(/[^a-zA-Z0-9-_]/g, '_') + '.pdf';
    const blobName = `event-bill-docs/${userId}-${timestamp}-${safeOriginal}`;

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId}-${timestamp}-${safeOriginal}`;
      const filepath = path.join(eventBillDocsPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/event-bill-docs/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload event report PDF
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadEventReportPDF({ userId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;

    // Basic validation for PDF
    const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return {
        success: false,
        statusCode: 400,
        message: 'Only PDF files are allowed',
      };
    }

    const timestamp = Date.now();
    const safeOriginal = path.parse(originalname).name.replace(/[^a-zA-Z0-9-_]/g, '_') + '.pdf';
    const blobName = `event-report-docs/${userId}-${timestamp}-${safeOriginal}`;

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId}-${timestamp}-${safeOriginal}`;
      const filepath = path.join(eventReportDocsPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/event-report-docs/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload disciplinary-process PDF
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadDisCoProcessPDF({ userId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;
    const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return {
        success: false,
        statusCode: 400,
        message: 'Only PDF files are allowed',
      };
    }

    const timestamp = Date.now();
    const safeOriginal = path.parse(originalname).name.replace(/[^a-zA-Z0-9-_]/g, '_') + '.pdf';
    const blobName = `disco-process-docs/${userId}-${timestamp}-${safeOriginal}`;

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId}-${timestamp}-${safeOriginal}`;
      const filepath = path.join(disCoProcessDocsPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/disco-process-docs/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: 'application/pdf' },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload payment screenshot
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadPaymentScreenshot({ userId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;

    // Basic validation for image types
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(mimetype)) {
      return {
        success: false,
        statusCode: 400,
        message: 'Only image files are allowed (png, jpg, jpeg, webp, gif)',
      };
    }

    const timestamp = Date.now();
    const parsed = path.parse(originalname);
    const safeBase = parsed.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeExt = parsed.ext && parsed.ext.length <= 10 ? parsed.ext : '.png';
    const blobName = `payment-screenshots/${userId || 'anonymous'}-${timestamp}-${safeBase}${safeExt}`;

    if (USE_LOCAL_STORAGE) {
      const paymentScreenshotsPath = path.join(uploadsBasePath, 'payment-screenshots');
      if (!fs.existsSync(paymentScreenshotsPath)) {
        fs.mkdirSync(paymentScreenshotsPath, { recursive: true });
      }
      const filename = `${userId || 'anonymous'}-${timestamp}-${safeBase}${safeExt}`;
      const filepath = path.join(paymentScreenshotsPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/payment-screenshots/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: mimetype },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload lost and found image
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadLostAndFoundImage({ userId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;

    // Basic validation for image types
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(mimetype)) {
      return {
        success: false,
        statusCode: 400,
        message: 'Only image files are allowed (png, jpg, jpeg, webp, gif)',
      };
    }

    const timestamp = Date.now();
    const parsed = path.parse(originalname);
    const safeBase = parsed.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeExt = parsed.ext && parsed.ext.length <= 10 ? parsed.ext : '.png';
    const blobName = `lost-and-found/${userId || 'anonymous'}-${timestamp}-${safeBase}${safeExt}`;

    if (USE_LOCAL_STORAGE) {
      const lostAndFoundPath = path.join(uploadsBasePath, 'lost-and-found');
      if (!fs.existsSync(lostAndFoundPath)) {
        fs.mkdirSync(lostAndFoundPath, { recursive: true });
      }
      const filename = `${userId || 'anonymous'}-${timestamp}-${safeBase}${safeExt}`;
      const filepath = path.join(lostAndFoundPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/lost-and-found/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: mimetype },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }

  /**
   * Upload certificate
   * @param {Object} params - Upload params
   * @returns {Object} Result object
   */
  async uploadCertificate({ userId, file }) {
    if (!file) {
      return {
        success: false,
        statusCode: 400,
        message: 'No file uploaded',
      };
    }

    const { originalname, buffer, mimetype } = file;

    // Validation for PDF and image types
    const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    const isPdf = mimetype === 'application/pdf' || originalname.toLowerCase().endsWith('.pdf');
    const isImage = allowedMimeTypes.slice(1).includes(mimetype);

    if (!isPdf && !isImage) {
      return {
        success: false,
        statusCode: 400,
        message: 'Only PDF and image files are allowed',
      };
    }

    const timestamp = Date.now();
    const parsed = path.parse(originalname);
    const safeBase = parsed.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const safeExt = parsed.ext && parsed.ext.length <= 10 ? parsed.ext : isPdf ? '.pdf' : '.png';
    const blobName = `certificates/${userId || 'anonymous'}-${timestamp}-${safeBase}${safeExt}`;

    if (USE_LOCAL_STORAGE) {
      const filename = `${userId || 'anonymous'}-${timestamp}-${safeBase}${safeExt}`;
      const filepath = path.join(certificatesPath, filename);
      fs.writeFileSync(filepath, buffer);
      const url = `/uploads/certificates/${filename}`;
      return { success: true, statusCode: 200, data: { url } };
    } else {
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: mimetype },
      });
      const sasUrl = this._generateSasUrl(blockBlobClient, AZURE_STORAGE_CONTAINER_NAME, blobName);
      return { success: true, statusCode: 200, data: { url: sasUrl } };
    }
  }
}

export const uploadService = new UploadService();
export default uploadService;
