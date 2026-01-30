/**
 * Insurance Provider Service
 * Handles insurance provider operations
 * 
 * @module services/insuranceProvider.service
 */

import InsuranceProvider from '../../models/InsuranceProvider.js';
import StudentProfile from '../../models/StudentProfile.js';
import Health from '../../models/Health.js';
import { BaseService, success, notFound, badRequest, withTransaction } from './base/index.js';

class InsuranceProviderService extends BaseService {
  constructor() {
    super(InsuranceProvider, 'Insurance provider');
  }

  /**
   * Create insurance provider
   * @param {Object} data - Provider data
   */
  async createInsuranceProvider(data) {
    const result = await this.create(data);
    if (result.success) {
      return success({ message: 'Insurance provider created', insuranceProvider: result.data }, 201);
    }
    return result;
  }

  /**
   * Get all insurance providers
   */
  async getInsuranceProviders() {
    const result = await this.findAll();
    if (result.success) {
      return success({ message: 'Insurance providers fetched', insuranceProviders: result.data });
    }
    return result;
  }

  /**
   * Update insurance provider
   * @param {string} id - Provider ID
   * @param {Object} data - Update data
   */
  async updateInsuranceProvider(id, data) {
    const result = await this.updateById(id, data);
    if (result.success) {
      return success({ message: 'Insurance provider updated', insuranceProvider: result.data });
    }
    return result;
  }

  /**
   * Delete insurance provider
   * @param {string} id - Provider ID
   */
  async deleteInsuranceProvider(id) {
    const result = await this.deleteById(id);
    if (result.success) {
      return success({ message: 'Insurance provider deleted' });
    }
    return result;
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

    return withTransaction(async (session) => {
      // Verify insurance provider exists
      const insuranceProvider = await this.model.findById(insuranceProviderId);
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
          notFound: results.notFound
        },
        successDetails: results.success
      });
    });
  }
}

export const insuranceProviderService = new InsuranceProviderService();
