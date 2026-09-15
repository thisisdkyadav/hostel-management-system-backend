/**
 * Insurance Provider Service
 * Handles insurance provider operations
 * 
 * @module services/insuranceProvider.service
 */

import path from 'node:path';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { success, notFound, badRequest, error, conflict, withTransaction } from '../../../../services/base/index.js';
import { healthOwner } from '../../../../services/health/healthOwner.service.js';
import { healthQueries } from '../../../../services/health/healthQueries.service.js';
import { insuranceOwner } from '../../../../services/insurance/insuranceOwner.service.js';
import { insuranceQueries } from '../../../../services/insurance/insuranceQueries.service.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';
import { invalidateStudentDashboardCache } from '../../../../utils/redisCache.js';
import { uploadService } from '../upload/upload.service.js';

/**
 * Insurance PDFs are named `{id}_{rollNumber}.pdf`, e.g. `10238188_230001024.pdf`.
 * The roll number is the last `_`-separated token of the basename.
 */
export const extractRollNumberFromInsurancePdfFilename = (filename) => {
  const base = path.basename(String(filename || '')).trim();
  const match = base.match(/^(.+)\.pdf$/i);
  if (!match) return null;
  const stem = match[1].trim();
  if (!stem) return null;
  const lastUnderscore = stem.lastIndexOf('_');
  const roll = (lastUnderscore === -1 ? stem : stem.slice(lastUnderscore + 1)).trim();
  return roll ? roll.toUpperCase() : null;
};

// Entity label for the response envelopes this service used to inherit from the
// former BaseService entity name ('Insurance provider').
const ENTITY = 'Insurance provider';

class InsuranceProviderService {
  /**
   * Create insurance provider
   * @param {Object} data - Provider data
   */
  async createInsuranceProvider(data) {
    let insuranceProvider;
    try {
      insuranceProvider = await insuranceOwner.createProvider(data);
    } catch (err) {
      if (err.code === 11000) {
        return conflict(`${ENTITY} already exists`);
      }
      return error(`Failed to create ${ENTITY}`, 500, err.message);
    }
    return success({ message: 'Insurance provider created', insuranceProvider }, 201);
  }

  /**
   * Get all insurance providers
   */
  async getInsuranceProviders() {
    let insuranceProviders;
    try {
      insuranceProviders = await insuranceQueries.listProviders();
    } catch (err) {
      return error(`Failed to fetch ${ENTITY}s`, 500, err.message);
    }
    return success({ message: 'Insurance providers fetched', insuranceProviders });
  }

  /**
   * Update insurance provider
   * @param {string} id - Provider ID
   * @param {Object} data - Update data
   */
  async updateInsuranceProvider(id, data) {
    let insuranceProvider;
    try {
      insuranceProvider = await insuranceOwner.updateProviderById(id, data);
    } catch (err) {
      return error(`Failed to update ${ENTITY}`, 500, err.message);
    }
    if (!insuranceProvider) {
      return notFound(ENTITY);
    }
    return success({ message: 'Insurance provider updated', insuranceProvider });
  }

  /**
   * Delete insurance provider
   * @param {string} id - Provider ID
   */
  async deleteInsuranceProvider(id) {
    let deleted;
    try {
      deleted = await insuranceOwner.deleteProviderById(id);
    } catch (err) {
      return error(`Failed to delete ${ENTITY}`, 500, err.message);
    }
    if (!deleted) {
      return notFound(ENTITY);
    }
    return success({ message: 'Insurance provider deleted' });
  }

  /**
   * Bulk update student insurance
   * @param {Object} data - Bulk data with insuranceProviderId and studentsData
   */
  async updateBulkStudentInsurance(data) {
    const { insuranceProviderId, studentsData } = data;

    if (!insuranceProviderId) {
      return badRequest('Insurance provider ID is required');
    }

    if (!Array.isArray(studentsData) || studentsData.length === 0) {
      return badRequest('Students data array is required and must not be empty');
    }
    if (studentsData.length > MAX_BULK_RECORDS) {
      return badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`);
    }

    return withTransaction(async (session) => {
      // Verify insurance provider exists (session-less, as in the original)
      const insuranceProvider = await insuranceQueries.findProviderById(insuranceProviderId);
      if (!insuranceProvider) {
        return notFound('Insurance provider');
      }

      const rollNumbers = studentsData.map((s) => s.rollNumber.toUpperCase());

      const studentProfiles = await studentProfileQueries.findByRollNumbers(rollNumbers, { session });

      if (studentProfiles.length === 0) {
        return notFound('No students found with the provided roll numbers');
      }

      // Build maps
      const studentProfileMap = {};
      const userIds = [];
      studentProfiles.forEach((profile) => {
        studentProfileMap[profile.rollNumber] = profile;
        userIds.push(profile.userId);
      });

      const results = { success: [], notFound: [] };

      // Build insurance data map
      const insuranceDataMap = {};
      studentsData.forEach((student) => {
        const rollNumber = student.rollNumber.toUpperCase();
        if (studentProfileMap[rollNumber]) {
          insuranceDataMap[studentProfileMap[rollNumber].userId.toString()] = {
            rollNumber,
            insuranceNumber: student.insuranceNumber
          };
        } else {
          results.notFound.push(rollNumber);
        }
      });

      // Get existing health records
      const existingHealthRecords = await healthQueries.findByUsers(userIds, { session });
      const healthRecordMap = {};
      existingHealthRecords.forEach((record) => {
        healthRecordMap[record.userId.toString()] = record;
      });

      // Prepare operations
      const healthRecordsToCreate = [];
      const bulkUpdateOps = [];

      userIds.forEach((userId) => {
        const userIdStr = userId.toString();
        const insuranceData = insuranceDataMap[userIdStr];
        if (!insuranceData) return;

        const isEmptyInsurance = !insuranceData.insuranceNumber || insuranceData.insuranceNumber.trim() === '';
        const insuranceObj = isEmptyInsurance
          ? { insuranceProvider: null, insuranceNumber: null }
          : { insuranceProvider: insuranceProviderId, insuranceNumber: insuranceData.insuranceNumber };

        if (healthRecordMap[userIdStr]) {
          bulkUpdateOps.push({
            updateOne: {
              filter: { _id: healthRecordMap[userIdStr]._id },
              update: {
                $set: {
                  'insurance.insuranceProvider': insuranceObj.insuranceProvider,
                  'insurance.insuranceNumber': insuranceObj.insuranceNumber,
                  updatedAt: Date.now(),
                }
              }
            }
          });
        } else {
          healthRecordsToCreate.push({
            userId,
            bloodGroup: '',
            insurance: insuranceObj
          });
        }

        results.success.push({
          rollNumber: insuranceData.rollNumber,
          userId,
          insuranceNumber: isEmptyInsurance ? null : insuranceData.insuranceNumber,
          ...(isEmptyInsurance && { note: 'Insurance data set to null' })
        });
      });

      if (healthRecordsToCreate.length > 0) {
        await healthOwner.insertHealthRecords(healthRecordsToCreate, { session });
      }
      if (bulkUpdateOps.length > 0) {
        await healthOwner.bulkWriteHealth(bulkUpdateOps, { session });
      }

      return success({
        message: 'Insurance provider update completed',
        results: {
          totalProcessed: studentsData.length,
          successfulUpdates: results.success.length,
          notFoundCount: results.notFound.length,
          failedCount: 0,
          notFound: results.notFound,
          failed: []
        },
        successDetails: results.success
      });
    });
  }

  /**
   * Attach one insurance PDF to the student whose roll number is in the filename.
   * @param {Object} params
   * @param {Express.Multer.File} params.file
   * @param {string} params.actorId
   * @param {string} params.actorRole
   */
  async attachStudentInsurancePdf({ file, actorId, actorRole }) {
    if (!file) {
      return badRequest('No file uploaded');
    }

    const rollNumber = extractRollNumberFromInsurancePdfFilename(file.originalname);
    if (!rollNumber) {
      return badRequest('Could not read a roll number from the file name. Use {id}_{rollNumber}.pdf');
    }

    const studentProfile = await studentProfileQueries.findByRollNumberCaseInsensitive(rollNumber, {
      select: 'userId rollNumber',
      lean: true,
    });
    if (!studentProfile?.userId) {
      return notFound(`Student with roll number ${rollNumber}`);
    }

    const uploadResult = await uploadService.uploadInsurancePdf({
      userId: studentProfile.userId,
      actorId,
      actorRole,
      file,
    });
    if (!uploadResult.success) {
      return error(uploadResult.message || 'Failed to upload insurance PDF', uploadResult.statusCode || 502);
    }

    const documentRef = uploadResult.data?.fileRef;
    const documentName = uploadResult.data?.originalName || file.originalname;
    if (!documentRef) {
      return error('Failed to upload insurance PDF', 502);
    }

    let health;
    try {
      health = await healthOwner.setInsuranceDocumentByUser(studentProfile.userId, {
        documentRef,
        documentName,
      });
    } catch (err) {
      return error('Failed to attach insurance PDF', 500, err.message);
    }

    await invalidateStudentDashboardCache(studentProfile.userId);

    return success({
      message: 'Insurance PDF attached',
      rollNumber: studentProfile.rollNumber,
      userId: studentProfile.userId,
      documentRef: health?.insurance?.documentRef || documentRef,
      documentName: health?.insurance?.documentName || documentName,
    });
  }
}

export const insuranceProviderService = new InsuranceProviderService();
