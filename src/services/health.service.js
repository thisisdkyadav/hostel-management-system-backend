/**
 * Health Service
 * Contains all business logic for health operations.
 * 
 * @module services/health
 */

import Health from '../../models/Health.js';
import InsuranceClaim from '../../models/InsuranceClaim.js';
import StudentProfile from '../../models/StudentProfile.js';
import mongoose from 'mongoose';

class HealthService {
  /**
   * Get health record for a user
   */
  async getHealth(userId) {
    const health = await Health.findOne({ userId }).populate('insurance.insuranceProvider');
    if (!health) {
      const newHealth = new Health({ userId, bloodGroup: '', insurance: {} });
      await newHealth.save();
      return { success: true, statusCode: 201, data: { message: 'Health created', health: newHealth } };
    }
    return { success: true, statusCode: 200, data: { message: 'Health fetched', health } };
  }

  /**
   * Update health record for a user
   */
  async updateHealth(userId, { bloodGroup, insurance }) {
    console.log('Insurance in updateHealth:', insurance);
    const health = await Health.findOneAndUpdate({ userId }, { bloodGroup, insurance }, { new: true });
    return { success: true, statusCode: 200, data: { message: 'Health updated', health } };
  }

  /**
   * Bulk update student health records
   */
  async updateBulkStudentHealth(studentsData) {
    if (!Array.isArray(studentsData) || studentsData.length === 0) {
      return { success: false, statusCode: 400, message: 'Students data array is required and must not be empty' };
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const rollNumbers = studentsData.map((student) => student.rollNumber.toUpperCase());

      const studentProfiles = await StudentProfile.find({
        rollNumber: { $in: rollNumbers },
      }).session(session);

      if (studentProfiles.length === 0) {
        await session.abortTransaction();
        session.endSession();
        return { success: false, statusCode: 404, message: 'No students found with the provided roll numbers' };
      }

      const studentProfileMap = {};
      const userIdToRollNumberMap = {};
      const userIds = [];

      studentProfiles.forEach((profile) => {
        studentProfileMap[profile.rollNumber] = profile;
        userIdToRollNumberMap[profile.userId.toString()] = profile.rollNumber;
        userIds.push(profile.userId);
      });

      const results = {
        success: [],
        notFound: [],
        failed: [],
      };

      const healthDataMap = {};
      studentsData.forEach((student) => {
        const rollNumber = student.rollNumber.toUpperCase();
        if (studentProfileMap[rollNumber]) {
          const userId = studentProfileMap[rollNumber].userId.toString();
          healthDataMap[userId] = {
            rollNumber,
            bloodGroup: student.bloodGroup,
          };
        } else {
          results.notFound.push(rollNumber);
        }
      });

      const existingHealthRecords = await Health.find({
        userId: { $in: userIds },
      }).session(session);

      const healthRecordMap = {};
      existingHealthRecords.forEach((record) => {
        healthRecordMap[record.userId.toString()] = record;
      });

      const healthRecordsToCreate = [];
      const healthRecordsToUpdate = [];

      userIds.forEach((userId) => {
        const userIdStr = userId.toString();
        const healthData = healthDataMap[userIdStr];

        if (!healthData) return;

        if (healthRecordMap[userIdStr]) {
          const healthRecord = healthRecordMap[userIdStr];
          healthRecord.bloodGroup = healthData.bloodGroup || healthRecord.bloodGroup;
          healthRecord.updatedAt = Date.now();
          healthRecordsToUpdate.push(healthRecord);
        } else {
          healthRecordsToCreate.push({
            userId: userId,
            bloodGroup: healthData.bloodGroup || '',
            insurance: { insuranceProvider: null, insuranceNumber: null },
          });
        }

        results.success.push({
          rollNumber: healthData.rollNumber,
          userId: userId,
          bloodGroup: healthData.bloodGroup,
        });
      });

      if (healthRecordsToCreate.length > 0) {
        await Health.insertMany(healthRecordsToCreate, { session });
      }

      const bulkUpdateOps = healthRecordsToUpdate.map((record) => ({
        updateOne: {
          filter: { _id: record._id },
          update: {
            $set: {
              bloodGroup: record.bloodGroup,
              updatedAt: Date.now(),
            },
          },
        },
      }));

      if (bulkUpdateOps.length > 0) {
        await Health.bulkWrite(bulkUpdateOps, { session });
      }

      await session.commitTransaction();
      session.endSession();

      return {
        success: true,
        statusCode: 200,
        data: {
          message: 'Bulk health update completed',
          results: {
            totalProcessed: studentsData.length,
            successfulUpdates: results.success.length,
            notFoundCount: results.notFound.length,
            failedCount: results.failed.length,
            notFound: results.notFound,
            failed: results.failed,
          },
          successDetails: results.success,
        },
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  }

  /**
   * Create insurance claim
   */
  async createInsuranceClaim(claimData) {
    const { userId, insuranceProvider, insuranceNumber, amount, hospitalName, description } = claimData;
    const insuranceClaim = await InsuranceClaim.create({
      userId,
      insuranceProvider,
      insuranceNumber,
      amount,
      hospitalName,
      description,
    });
    return { success: true, statusCode: 201, data: { message: 'Insurance claim created', insuranceClaim } };
  }

  /**
   * Get insurance claims for a user
   */
  async getInsuranceClaims(userId) {
    const insuranceClaims = await InsuranceClaim.find({ userId });
    return { success: true, statusCode: 200, data: { message: 'Insurance claims fetched', insuranceClaims } };
  }

  /**
   * Update insurance claim
   */
  async updateInsuranceClaim(id, claimData) {
    const { userId, insuranceProvider, insuranceNumber, amount, hospitalName, description } = claimData;
    const insuranceClaim = await InsuranceClaim.findByIdAndUpdate(
      id,
      { userId, insuranceProvider, insuranceNumber, amount, hospitalName, description },
      { new: true }
    );
    return { success: true, statusCode: 200, data: { message: 'Insurance claim updated', insuranceClaim } };
  }

  /**
   * Delete insurance claim
   */
  async deleteInsuranceClaim(id) {
    await InsuranceClaim.findByIdAndDelete(id);
    return { success: true, statusCode: 200, message: 'Insurance claim deleted' };
  }
}

export const healthService = new HealthService();
export default healthService;
