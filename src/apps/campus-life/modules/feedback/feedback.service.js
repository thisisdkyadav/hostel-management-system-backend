/**
 * Feedback Service
 * Handles student feedback operations
 * 
 * @module services/feedback.service
 */

import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { success, badRequest, error, notFound, conflict } from '../../../../services/base/index.js';
import { feedbackOwner } from '../../../../services/feedback/feedbackOwner.service.js';
import { feedbackQueries } from '../../../../services/feedback/feedbackQueries.service.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parsePositiveInt = (value, fallback, min = 1, max = 100) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const normalizeFeedbackStatus = (status = 'all') => {
  const normalized = String(status).trim().toLowerCase();
  if (normalized === 'pending') return 'Pending';
  if (normalized === 'seen') return 'Seen';
  return null;
};

const ENTITY = 'Feedback';

class FeedbackService {
  /**
   * Create feedback for a student
   * @param {Object} data - Feedback data (title, description)
   * @param {Object} user - Current user
   */
  async createFeedback(data, user) {
    const userId = user._id;

    const studentProfile = await studentProfileQueries.findByUserIdWithAllocation(userId);

    if (!studentProfile || !studentProfile.currentRoomAllocation) {
      return badRequest("Cannot create feedback. User doesn't have an active hostel allocation.");
    }

    let feedback;
    try {
      feedback = await feedbackOwner.createFeedback({
        userId,
        hostelId: studentProfile.currentRoomAllocation.hostelId,
        title: data.title,
        description: data.description,
      });
    } catch (err) {
      if (err.code === 11000) {
        return conflict(`${ENTITY} already exists`);
      }
      return error(`Failed to create ${ENTITY}`, 500, err.message);
    }

    return success(
      { message: 'Feedback created successfully', feedback, success: true },
      201
    );
  }

  /**
   * Get feedbacks based on user role
   * @param {Object} query - Query filters
   * @param {Object} user - Current user
   */
  async getFeedbacks(query, user) {
    const queryObj = query || {};
    const page = parsePositiveInt(queryObj.page, 1);
    const limit = parsePositiveInt(queryObj.limit, 10);
    const status = normalizeFeedbackStatus(queryObj.status);
    const searchTerm = typeof queryObj.search === 'string' ? queryObj.search.trim() : '';

    const scopedQuery = {};
    if (user.hostel) {
      scopedQuery.hostelId = user.hostel._id || user.hostel;
    } else if (user.role === 'Student') {
      scopedQuery.userId = user._id;
    }

    const filteredQuery = { ...scopedQuery };
    if (status) {
      filteredQuery.status = status;
    }
    if (searchTerm) {
      const regex = new RegExp(escapeRegex(searchTerm), 'i');
      filteredQuery.$or = [{ title: regex }, { description: regex }];
    }

    const skip = (page - 1) * limit;

    try {
      const [feedbacks, total, totalAll, totalPending, totalSeen, latestFeedback] = await Promise.all([
        feedbackQueries.listFeedbacks(filteredQuery, { skip, limit }),
        feedbackQueries.countFeedbacks(filteredQuery),
        feedbackQueries.countFeedbacks(scopedQuery),
        feedbackQueries.countFeedbacks({ ...scopedQuery, status: 'Pending' }),
        feedbackQueries.countFeedbacks({ ...scopedQuery, status: 'Seen' }),
        feedbackQueries.findLatestCreatedAt(scopedQuery),
      ]);

      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

      return success({
        feedbacks,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasMore: page * limit < total,
        },
        stats: {
          total: totalAll,
          pending: totalPending,
          seen: totalSeen,
          latestFeedbackDate: latestFeedback?.createdAt || null,
        },
        success: true,
      });
    } catch (err) {
      return error('Failed to fetch feedbacks', 500, err?.message || err);
    }
  }

  /**
   * Update feedback status
   * @param {string} feedbackId - Feedback ID
   * @param {string} status - New status
   */
  async updateFeedbackStatus(feedbackId, status) {
    let feedback;
    try {
      feedback = await feedbackOwner.updateFeedbackById(feedbackId, { status, reply: null });
    } catch (err) {
      return error(`Failed to update ${ENTITY}`, 500, err.message);
    }
    if (!feedback) return notFound(ENTITY);
    return success({ message: 'Feedback status updated successfully', feedback, success: true });
  }

  /**
   * Reply to feedback
   * @param {string} feedbackId - Feedback ID
   * @param {string} reply - Reply text
   */
  async replyToFeedback(feedbackId, reply) {
    let feedback;
    try {
      feedback = await feedbackOwner.updateFeedbackById(feedbackId, { reply, status: 'Seen' });
    } catch (err) {
      return error(`Failed to update ${ENTITY}`, 500, err.message);
    }
    if (!feedback) return notFound(ENTITY);
    return success({ message: 'Reply added successfully', feedback, success: true });
  }

  /**
   * Update feedback
   * @param {string} feedbackId - Feedback ID
   * @param {Object} data - Update data
   */
  async updateFeedback(feedbackId, data) {
    let feedback;
    try {
      feedback = await feedbackOwner.updateFeedbackById(feedbackId, {
        title: data.title,
        description: data.description,
      });
    } catch (err) {
      return error(`Failed to update ${ENTITY}`, 500, err.message);
    }
    if (!feedback) return notFound(ENTITY);
    return success({ message: 'Feedback updated successfully', feedback, success: true });
  }

  /**
   * Delete feedback
   * @param {string} feedbackId - Feedback ID
   */
  async deleteFeedback(feedbackId) {
    let deleted;
    try {
      deleted = await feedbackOwner.deleteFeedbackById(feedbackId);
    } catch (err) {
      return error(`Failed to delete ${ENTITY}`, 500, err.message);
    }
    if (!deleted) return notFound(ENTITY);
    return success({ message: 'Feedback deleted successfully', success: true });
  }

  /**
   * Get feedbacks for a specific student
   * @param {string} userId - Student user ID
   */
  async getStudentFeedbacks(userId) {
    let feedbacks;
    try {
      feedbacks = await feedbackQueries.findByUserPopulated(userId);
    } catch (err) {
      return error(`Failed to fetch ${ENTITY}s`, 500, err.message);
    }
    return success({ feedbacks, success: true });
  }
}

export const feedbackService = new FeedbackService();
