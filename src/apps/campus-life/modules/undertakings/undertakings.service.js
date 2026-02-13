/**
 * Undertaking Service
 * Contains all business logic for undertaking operations.
 * 
 * @module services/undertaking
 */

import { Undertaking } from '../../../../models/index.js';
import { UndertakingAssignment } from '../../../../models/index.js';
import { StudentProfile } from '../../../../models/index.js';
import { BaseService, success, notFound, badRequest } from '../../../../services/base/index.js';

class UndertakingService extends BaseService {
  constructor() {
    super(Undertaking, 'Undertaking');
  }

  // Admin APIs

  /**
   * Get all undertakings
   */
  async getAllUndertakings() {
    const undertakings = await this.model.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .populate('totalStudents')
      .populate('acceptedCount');

    const formattedUndertakings = undertakings.map((undertaking) => ({
      id: undertaking._id,
      title: undertaking.title,
      description: undertaking.description,
      content: undertaking.content,
      deadline: undertaking.deadline,
      createdAt: undertaking.createdAt,
      totalStudents: undertaking.totalStudents || 0,
      acceptedCount: undertaking.acceptedCount || 0,
      status: undertaking.status
    }));

    return success({ undertakings: formattedUndertakings });
  }

  /**
   * Create a new undertaking
   * @param {Object} data - Undertaking data
   * @param {Object} user - Creating user
   */
  async createUndertaking(data, user) {
    const { title, description, content, deadline } = data;

    const result = await this.create({
      title,
      description,
      content,
      deadline,
      createdBy: user._id
    });

    if (result.success) {
      const undertaking = result.data;
      return {
        success: true,
        statusCode: 201,
        message: 'Undertaking created successfully',
        data: {
          undertaking: {
            id: undertaking._id,
            title: undertaking.title,
            description: undertaking.description,
            content: undertaking.content,
            deadline: undertaking.deadline,
            createdAt: undertaking.createdAt,
            status: undertaking.status
          }
        }
      };
    }
    return result;
  }

  /**
   * Update an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @param {Object} data - Update data
   */
  async updateUndertaking(undertakingId, data) {
    const { title, description, content, deadline } = data;

    const undertaking = await this.model.findByIdAndUpdate(
      undertakingId,
      { title, description, content, deadline, updatedAt: new Date() },
      { new: true }
    );

    if (!undertaking) {
      return notFound(this.entityName);
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Undertaking updated successfully',
      data: {
        undertaking: {
          id: undertaking._id,
          title: undertaking.title,
          description: undertaking.description,
          content: undertaking.content,
          deadline: undertaking.deadline,
          updatedAt: undertaking.updatedAt
        }
      }
    };
  }

  /**
   * Delete an undertaking
   * @param {string} undertakingId - Undertaking ID
   */
  async deleteUndertaking(undertakingId) {
    const undertaking = await this.model.findByIdAndDelete(undertakingId);

    if (!undertaking) {
      return notFound(this.entityName);
    }

    // Delete all assignments related to this undertaking
    await UndertakingAssignment.deleteMany({ undertakingId });

    return {
      success: true,
      statusCode: 200,
      message: 'Undertaking deleted successfully',
      data: { undertakingId }
    };
  }

  /**
   * Get students assigned to an undertaking
   * @param {string} undertakingId - Undertaking ID
   */
  async getAssignedStudents(undertakingId) {
    const assignments = await UndertakingAssignment.find({ undertakingId }).populate({
      path: 'studentId',
      select: '_id rollNumber',
      populate: { path: 'userId', select: 'name email' }
    });

    if (!assignments || assignments.length === 0) {
      return success({ students: [] });
    }

    const students = assignments.map((assignment) => ({
      id: assignment.studentId._id,
      name: assignment.studentId.userId?.name || '',
      email: assignment.studentId.userId?.email || '',
      rollNumber: assignment.studentId.rollNumber,
      status: assignment.status,
      acceptedAt: assignment.acceptedAt
    }));

    return success({ students });
  }

  /**
   * Add students to an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @param {Array} rollNumbers - Array of roll numbers
   */
  async addStudentsToUndertaking(undertakingId, rollNumbers) {
    const undertaking = await this.model.findById(undertakingId);

    if (!undertaking) {
      return notFound(this.entityName);
    }

    // Find student profiles by roll numbers
    const studentProfiles = await StudentProfile.find({
      rollNumber: { $in: rollNumbers }
    });

    if (studentProfiles.length === 0) {
      return notFound('No students found with the provided roll numbers');
    }

    // Get student IDs from profiles
    const studentIds = studentProfiles.map((profile) => profile._id);

    // Create assignment entries for each student
    const assignments = studentIds.map((studentId) => ({
      undertakingId,
      studentId,
      status: 'not_viewed',
      assignedAt: new Date()
    }));

    // Use insertMany with ordered: false to ignore duplicates
    const result = await UndertakingAssignment.insertMany(assignments, { ordered: false }).catch((err) => {
      if (err.code === 11000) {
        return err.insertedDocs || [];
      }
      throw err;
    });

    const addedStudents = studentProfiles.map((profile) => ({
      id: profile._id,
      rollNumber: profile.rollNumber
    }));

    return success({
      addedCount: result.length,
      undertakingId,
      addedStudents
    }, 200, 'Students added to undertaking successfully');
  }

  /**
   * Remove a student from an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @param {string} studentId - Student ID
   */
  async removeStudentFromUndertaking(undertakingId, studentId) {
    const result = await UndertakingAssignment.findOneAndDelete({
      undertakingId,
      studentId
    });

    if (!result) {
      return notFound('Assignment');
    }

    return success({ undertakingId, studentId }, 200, 'Student removed from undertaking successfully');
  }

  /**
   * Get undertaking acceptance status
   * @param {string} undertakingId - Undertaking ID
   */
  async getUndertakingStatus(undertakingId) {
    const undertaking = await this.model.findById(undertakingId);

    if (!undertaking) {
      return notFound(this.entityName);
    }

    const assignments = await UndertakingAssignment.find({ undertakingId }).populate({
      path: 'studentId',
      select: '_id rollNumber',
      populate: { path: 'userId', select: 'name email' }
    });

    // Calculate stats
    const totalStudents = assignments.length;
    const accepted = assignments.filter((a) => a.status === 'accepted').length;
    const pending = assignments.filter((a) => a.status === 'pending').length;
    const notViewed = assignments.filter((a) => a.status === 'not_viewed').length;

    const students = assignments.map((assignment) => ({
      id: assignment.studentId._id,
      name: assignment.studentId.userId?.name || '',
      email: assignment.studentId.userId?.email || '',
      rollNumber: assignment.studentId.rollNumber,
      status: assignment.status,
      acceptedAt: assignment.acceptedAt
    }));

    return success({
      undertakingId,
      title: undertaking.title,
      stats: { totalStudents, accepted, pending, notViewed },
      students
    });
  }

  // Student APIs

  /**
   * Get student's pending undertakings
   * @param {string} userId - User ID
   */
  async getStudentPendingUndertakings(userId) {
    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const assignments = await UndertakingAssignment.find({
      studentId: studentProfile._id,
      status: { $in: ['not_viewed', 'pending'] }
    }).populate('undertakingId');

    const pendingUndertakings = assignments.map((assignment) => ({
      id: assignment.undertakingId._id,
      title: assignment.undertakingId.title,
      description: assignment.undertakingId.description,
      content: assignment.undertakingId.content,
      deadline: assignment.undertakingId.deadline,
      status: assignment.status
    }));

    return success({ pendingUndertakings });
  }

  /**
   * Get undertaking details for a student
   * @param {string} undertakingId - Undertaking ID
   * @param {string} userId - User ID
   */
  async getUndertakingDetails(undertakingId, userId) {
    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const undertaking = await this.model.findById(undertakingId);

    if (!undertaking) {
      return notFound(this.entityName);
    }

    const assignment = await UndertakingAssignment.findOne({
      undertakingId,
      studentId: studentProfile._id
    });

    if (!assignment) {
      return notFound('Undertaking not assigned to this student');
    }

    // Mark as viewed if not already
    if (assignment.status === 'not_viewed') {
      assignment.status = 'pending';
      assignment.viewedAt = new Date();
      await assignment.save();
    }

    return success({
      undertaking: {
        id: undertaking._id,
        title: undertaking.title,
        description: undertaking.description,
        content: undertaking.content,
        deadline: undertaking.deadline,
        status: assignment.status
      }
    });
  }

  /**
   * Accept an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @param {boolean} accepted - Acceptance confirmation
   * @param {string} userId - User ID
   */
  async acceptUndertaking(undertakingId, accepted, userId) {
    if (!accepted) {
      return badRequest('Acceptance confirmation required');
    }

    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const assignment = await UndertakingAssignment.findOne({
      undertakingId,
      studentId: studentProfile._id
    });

    if (!assignment) {
      return notFound('Undertaking not assigned to this student');
    }

    const now = new Date();
    assignment.status = 'accepted';
    assignment.acceptedAt = now;
    assignment.viewedAt = assignment.viewedAt || now;

    await assignment.save();

    return {
      success: true,
      statusCode: 200,
      message: 'Undertaking accepted successfully',
      data: { undertakingId, acceptedAt: assignment.acceptedAt }
    };
  }

  /**
   * Get student's accepted undertakings
   * @param {string} userId - User ID
   */
  async getStudentAcceptedUndertakings(userId) {
    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const assignments = await UndertakingAssignment.find({
      studentId: studentProfile._id,
      status: 'accepted'
    }).populate('undertakingId');

    const acceptedUndertakings = assignments.map((assignment) => ({
      id: assignment.undertakingId._id,
      title: assignment.undertakingId.title,
      description: assignment.undertakingId.description,
      acceptedAt: assignment.acceptedAt
    }));

    return success({ acceptedUndertakings });
  }

  /**
   * Get count of student's pending undertakings
   * @param {string} userId - User ID
   */
  async getStudentPendingUndertakingsCount(userId) {
    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const count = await UndertakingAssignment.countDocuments({
      studentId: studentProfile._id,
      status: { $in: ['not_viewed', 'pending'] }
    });

    return success({ count });
  }
}

export const undertakingService = new UndertakingService();
export default undertakingService;
