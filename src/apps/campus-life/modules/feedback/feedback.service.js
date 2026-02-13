/**
 * Feedback Service
 * Handles student feedback operations
 * 
 * @module services/feedback.service
 */

import { Feedback } from '../../../../models/index.js';
import { StudentProfile } from '../../../../models/index.js';
import { BaseService, success, badRequest, PRESETS } from '../../../../services/base/index.js';

class FeedbackService extends BaseService {
  constructor() {
    super(Feedback, 'Feedback');
  }

  /**
   * Create feedback for a student
   * @param {Object} data - Feedback data (title, description)
   * @param {Object} user - Current user
   */
  async createFeedback(data, user) {
    const userId = user._id;

    const studentProfile = await StudentProfile.findOne({ userId }).populate('currentRoomAllocation');

    if (!studentProfile || !studentProfile.currentRoomAllocation) {
      return badRequest("Cannot create feedback. User doesn't have an active hostel allocation.");
    }

    const result = await this.create({
      userId,
      hostelId: studentProfile.currentRoomAllocation.hostelId,
      title: data.title,
      description: data.description,
    });

    if (result.success) {
      return success(
        { message: 'Feedback created successfully', feedback: result.data, success: true },
        201
      );
    }
    return result;
  }

  /**
   * Get feedbacks based on user role
   * @param {Object} query - Query filters
   * @param {Object} user - Current user
   */
  async getFeedbacks(query, user) {
    const queryObj = query || {};

    if (user.hostel) {
      queryObj.hostelId = user.hostel._id;
    } else if (user.role === 'Student') {
      queryObj.userId = user._id;
    }

    const result = await this.findAll(queryObj, { populate: PRESETS.FEEDBACK });
    if (result.success) {
      return success({ feedbacks: result.data, success: true });
    }
    return result;
  }

  /**
   * Update feedback status
   * @param {string} feedbackId - Feedback ID
   * @param {string} status - New status
   */
  async updateFeedbackStatus(feedbackId, status) {
    const result = await this.updateById(feedbackId, { status, reply: null });
    if (result.success) {
      return success({ message: 'Feedback status updated successfully', feedback: result.data, success: true });
    }
    return result;
  }

  /**
   * Reply to feedback
   * @param {string} feedbackId - Feedback ID
   * @param {string} reply - Reply text
   */
  async replyToFeedback(feedbackId, reply) {
    const result = await this.updateById(feedbackId, { reply, status: 'Seen' });
    if (result.success) {
      return success({ message: 'Reply added successfully', feedback: result.data, success: true });
    }
    return result;
  }

  /**
   * Update feedback
   * @param {string} feedbackId - Feedback ID
   * @param {Object} data - Update data
   */
  async updateFeedback(feedbackId, data) {
    const result = await this.updateById(feedbackId, {
      title: data.title,
      description: data.description,
    });
    if (result.success) {
      return success({ message: 'Feedback updated successfully', feedback: result.data, success: true });
    }
    return result;
  }

  /**
   * Delete feedback
   * @param {string} feedbackId - Feedback ID
   */
  async deleteFeedback(feedbackId) {
    const result = await this.deleteById(feedbackId);
    if (result.success) {
      return success({ message: 'Feedback deleted successfully', success: true });
    }
    return result;
  }

  /**
   * Get feedbacks for a specific student
   * @param {string} userId - Student user ID
   */
  async getStudentFeedbacks(userId) {
    const result = await this.findAll({ userId }, { populate: PRESETS.FEEDBACK });
    if (result.success) {
      return success({ feedbacks: result.data, success: true });
    }
    return result;
  }
}

export const feedbackService = new FeedbackService();
