/**
 * Undertaking Service
 * Contains all business logic for undertaking operations.
 * 
 * @module services/undertaking
 */

import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';
import { success, notFound, badRequest, error, conflict } from '../../../../services/base/index.js';
import { undertakingOwner } from '../../../../services/certificate/undertakingOwner.service.js';
import { undertakingQueries } from '../../../../services/certificate/undertakingQueries.service.js';
import { undertakingAssignmentOwner } from '../../../../services/certificate/undertakingAssignmentOwner.service.js';
import { undertakingAssignmentQueries } from '../../../../services/certificate/undertakingAssignmentQueries.service.js';
import { MAX_BULK_RECORDS } from '../../../../core/constants/system-limits.constants.js';

const ENTITY = 'Undertaking';

class UndertakingService {
  // Admin APIs

  /**
   * Get all undertakings
   */
  async getAllUndertakings() {
    const undertakings = await undertakingQueries.listUndertakingsWithCounts();

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

    let undertaking;
    try {
      undertaking = await undertakingOwner.createUndertaking({
        title,
        description,
        content,
        deadline,
        createdBy: user._id
      });
    } catch (err) {
      if (err.code === 11000) {
        return conflict(`${ENTITY} already exists`);
      }
      return error(`Failed to create ${ENTITY}`, 500, err.message);
    }

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

  /**
   * Update an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @param {Object} data - Update data
   */
  async updateUndertaking(undertakingId, data) {
    const { title, description, content, deadline } = data;

    const undertaking = await undertakingOwner.updateUndertaking(
      undertakingId,
      { title, description, content, deadline, updatedAt: new Date() }
    );

    if (!undertaking) {
      return notFound(ENTITY);
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
    const undertaking = await undertakingOwner.deleteUndertaking(undertakingId);

    if (!undertaking) {
      return notFound(ENTITY);
    }

    // Delete all assignments related to this undertaking
    await undertakingAssignmentOwner.deleteAssignmentsByUndertaking(undertakingId);

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
    const assignments = await undertakingAssignmentQueries.findAssignmentsByUndertaking(undertakingId);

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
    if (!Array.isArray(rollNumbers) || rollNumbers.length === 0) {
      return badRequest('Roll numbers array is required');
    }
    if (rollNumbers.length > MAX_BULK_RECORDS) {
      return badRequest(`Maximum ${MAX_BULK_RECORDS} records are allowed per request`);
    }

    const undertaking = await undertakingQueries.findUndertakingById(undertakingId);

    if (!undertaking) {
      return notFound(ENTITY);
    }

    // Find student profiles by roll numbers
    const studentProfiles = await studentProfileQueries.findByRollNumbers(rollNumbers);

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
    const result = await undertakingAssignmentOwner.insertAssignments(assignments).catch((err) => {
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
    const result = await undertakingAssignmentOwner.deleteAssignment(undertakingId, studentId);

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
    const undertaking = await undertakingQueries.findUndertakingById(undertakingId);

    if (!undertaking) {
      return notFound(ENTITY);
    }

    const assignments = await undertakingAssignmentQueries.findAssignmentsByUndertaking(undertakingId);

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
    const studentProfile = await studentProfileQueries.findByUserId(userId);

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const assignments = await undertakingAssignmentQueries.findStudentAssignmentsPopulated(
      studentProfile._id,
      { $in: ['not_viewed', 'pending'] }
    );

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
    const studentProfile = await studentProfileQueries.findByUserId(userId);

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const undertaking = await undertakingQueries.findUndertakingById(undertakingId);

    if (!undertaking) {
      return notFound(ENTITY);
    }

    const assignment = await undertakingAssignmentQueries.findAssignment(undertakingId, studentProfile._id);

    if (!assignment) {
      return notFound('Undertaking not assigned to this student');
    }

    // Mark as viewed if not already
    if (assignment.status === 'not_viewed') {
      assignment.status = 'pending';
      assignment.viewedAt = new Date();
      await undertakingAssignmentOwner.persistAssignment(assignment);
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

    const studentProfile = await studentProfileQueries.findByUserId(userId);

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const assignment = await undertakingAssignmentQueries.findAssignment(undertakingId, studentProfile._id);

    if (!assignment) {
      return notFound('Undertaking not assigned to this student');
    }

    const now = new Date();
    assignment.status = 'accepted';
    assignment.acceptedAt = now;
    assignment.viewedAt = assignment.viewedAt || now;

    await undertakingAssignmentOwner.persistAssignment(assignment);

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
    const studentProfile = await studentProfileQueries.findByUserId(userId);

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const assignments = await undertakingAssignmentQueries.findStudentAssignmentsPopulated(
      studentProfile._id,
      'accepted'
    );

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
    const studentProfile = await studentProfileQueries.findByUserId(userId);

    if (!studentProfile) {
      return notFound('Student profile');
    }

    const count = await undertakingAssignmentQueries.countStudentAssignmentsByStatus(
      studentProfile._id,
      { $in: ['not_viewed', 'pending'] }
    );

    return success({ count });
  }
}

export const undertakingService = new UndertakingService();
export default undertakingService;
