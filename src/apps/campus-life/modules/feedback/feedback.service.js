/**
 * Feedback Service
 * Handles student feedback operations
 * 
 * @module services/feedback.service
 */

import { Feedback } from '../../../../models/index.js';
import { StudentProfile } from '../../../../models/index.js';
import { BaseService, success, badRequest, error, PRESETS } from '../../../../services/base/index.js';

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
        this.model.find(filteredQuery)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate(PRESETS.FEEDBACK),
        this.model.countDocuments(filteredQuery),
        this.model.countDocuments(scopedQuery),
        this.model.countDocuments({ ...scopedQuery, status: 'Pending' }),
        this.model.countDocuments({ ...scopedQuery, status: 'Seen' }),
        this.model.findOne(scopedQuery).sort({ createdAt: -1 }).select('createdAt').lean(),
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
