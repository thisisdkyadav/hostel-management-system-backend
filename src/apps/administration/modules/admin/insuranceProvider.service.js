/**
 * Insurance Provider Service
 * Handles insurance provider operations
 * 
 * @module services/insuranceProvider.service
 */

import { StudentProfile } from '../../../../models/index.js';
import { Health } from '../../../../models/index.js';
import { success, notFound, badRequest, error, conflict, withTransaction } from '../../../../services/base/index.js';
import { insuranceOwner } from '../../../../services/insurance/insuranceOwner.service.js';
import { insuranceQueries } from '../../../../services/insurance/insuranceQueries.service.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

// Entity label for the response envelopes this service used to inherit from
// BaseService (super(InsuranceProvider, 'Insurance provider')).
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

      const studentProfiles = await StudentProfile.find({
        rollNumber: { $in: rollNumbers }
      }).session(session);

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
      const existingHealthRecords = await Health.find({ userId: { $in: userIds } }).session(session);
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
              update: { $set: { insurance: insuranceObj, updatedAt: Date.now() } }
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
        await Health.insertMany(healthRecordsToCreate, { session });
      }
      if (bulkUpdateOps.length > 0) {
        await Health.bulkWrite(bulkUpdateOps, { session });
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
}

export const insuranceProviderService = new InsuranceProviderService();
