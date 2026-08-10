/**
 * Health Service
 * Contains all business logic for health operations.
 * 
 * @module services/health
 */

import { findStudentsByRollNumbersInScope } from '../../../../utils/hostelScope.js';
import { success, badRequest, notFound, withTransaction } from '../../../../services/base/index.js';
import { healthOwner } from '../../../../services/health/healthOwner.service.js';
import { healthQueries } from '../../../../services/health/healthQueries.service.js';
import { insuranceOwner } from '../../../../services/insurance/insuranceOwner.service.js';
import { insuranceQueries } from '../../../../services/insurance/insuranceQueries.service.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

class HealthService {
  /**
   * Get health record for a user
   * @param {string} userId - User ID
   */
  async getHealth(userId) {
    const health = await healthQueries.findByUserWithProvider(userId);
    if (!health) {
      const newHealth = await healthOwner.createHealth({ userId, bloodGroup: '', insurance: {} });
      return success({ message: 'Health created', health: newHealth }, 201);
    }
    return success({ message: 'Health fetched', health });
  }

  /**
   * Update health record for a user
   * @param {string} userId - User ID
   * @param {Object} data - Health data
   */
  async updateHealth(userId, { bloodGroup, insurance }) {
    const health = await healthOwner.updateHealthByUser(userId, { bloodGroup, insurance });
    return success({ message: 'Health updated', health });
  }

  /**
   * Bulk update student health records
   * @param {Array} studentsData - Array of student data with rollNumber and bloodGroup
   */
  /**
   * @param {Array} studentsData - [{ rollNumber, bloodGroup }]
   * @param {Object} [scope] - caller's hostel scope; unbound callers reach every student
   */
  async updateBulkStudentHealth(studentsData, scope = null) {
    if (!Array.isArray(studentsData) || studentsData.length === 0) {
      return badRequest('Students data array is required and must not be empty');
    }
    if (studentsData.length > MAX_BULK_RECORDS) {
      return badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`);
    }

    return withTransaction(async (session) => {
      const rollNumbers = studentsData.map((student) => student.rollNumber.toUpperCase());

      const studentProfiles = await findStudentsByRollNumbersInScope(rollNumbers, scope, { session });

      if (studentProfiles.length === 0) {
        return notFound('No students found with the provided roll numbers');
      }

      const studentProfileMap = {};
      const userIds = [];

      studentProfiles.forEach((profile) => {
        studentProfileMap[profile.rollNumber] = profile;
        userIds.push(profile.userId);
      });

      const results = { success: [], notFound: [] };

      // Build health data map
      const healthDataMap = {};
      studentsData.forEach((student) => {
        const rollNumber = student.rollNumber.toUpperCase();
        if (studentProfileMap[rollNumber]) {
          const userId = studentProfileMap[rollNumber].userId.toString();
          healthDataMap[userId] = {
            rollNumber,
            bloodGroup: student.bloodGroup
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
        const healthData = healthDataMap[userIdStr];
        if (!healthData) return;

        if (healthRecordMap[userIdStr]) {
          bulkUpdateOps.push({
            updateOne: {
              filter: { _id: healthRecordMap[userIdStr]._id },
              update: { $set: { bloodGroup: healthData.bloodGroup, updatedAt: Date.now() } }
            }
          });
        } else {
          healthRecordsToCreate.push({
            userId,
            bloodGroup: healthData.bloodGroup || '',
            insurance: { insuranceProvider: null, insuranceNumber: null }
          });
        }

        results.success.push({
          rollNumber: healthData.rollNumber,
          userId,
          bloodGroup: healthData.bloodGroup
        });
      });

      if (healthRecordsToCreate.length > 0) {
        await healthOwner.insertHealthRecords(healthRecordsToCreate, { session });
      }
      if (bulkUpdateOps.length > 0) {
        await healthOwner.bulkWriteHealth(bulkUpdateOps, { session });
      }

      return success({
        message: 'Bulk health update completed',
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
   * Create insurance claim
   * @param {Object} claimData - Claim data
   */
  async createInsuranceClaim(claimData) {
    const insuranceClaim = await insuranceOwner.createClaim(claimData);
    return success({ message: 'Insurance claim created', insuranceClaim }, 201);
  }

  /**
   * Get insurance claims for a user
   * @param {string} userId - User ID
   */
  async getInsuranceClaims(userId) {
    const insuranceClaims = await insuranceQueries.findClaimsByUser(userId);
    return success({ message: 'Insurance claims fetched', insuranceClaims });
  }

  /**
   * Update insurance claim
   * @param {string} id - Claim ID
   * @param {Object} claimData - Claim data
   */
  async updateInsuranceClaim(id, claimData) {
    const insuranceClaim = await insuranceOwner.updateClaimById(id, claimData);
    return success({ message: 'Insurance claim updated', insuranceClaim });
  }

  /**
   * Delete insurance claim
   * @param {string} id - Claim ID
   */
  async deleteInsuranceClaim(id) {
    await insuranceOwner.deleteClaimById(id);
    return { success: true, statusCode: 200, message: 'Insurance claim deleted' };
  }
}

export const healthService = new HealthService();
export default healthService;
