/**
 * Undertaking Service
 * Contains all business logic for undertaking operations.
 * 
 * @module services/undertaking
 */

import Undertaking from '../../models/Undertaking.js';
import UndertakingAssignment from '../../models/UndertakingAssignment.js';
import StudentProfile from '../../models/StudentProfile.js';

class UndertakingService {
  // Admin APIs

  /**
   * Get all undertakings
   * @returns {Object} Result object
   */
  async getAllUndertakings() {
    console.log('getAllUndertakings');
    const undertakings = await Undertaking.find().populate('createdBy', 'name email').sort({ createdAt: -1 }).populate('totalStudents').populate('acceptedCount');

    const formattedUndertakings = undertakings.map((undertaking) => {
      return {
        id: undertaking._id,
        title: undertaking.title,
        description: undertaking.description,
        content: undertaking.content,
        deadline: undertaking.deadline,
        createdAt: undertaking.createdAt,
        totalStudents: undertaking.totalStudents || 0,
        acceptedCount: undertaking.acceptedCount || 0,
        status: undertaking.status,
      };
    });

    return {
      success: true,
      statusCode: 200,
      data: { undertakings: formattedUndertakings },
    };
  }

  /**
   * Create a new undertaking
   * @param {Object} data - Undertaking data
   * @param {Object} user - Creating user
   * @returns {Object} Result object
   */
  async createUndertaking(data, user) {
    const { title, description, content, deadline } = data;

    const undertaking = new Undertaking({
      title,
      description,
      content,
      deadline,
      createdBy: user._id,
    });

    await undertaking.save();

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
          status: undertaking.status,
        },
      },
    };
  }

  /**
   * Update an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @param {Object} data - Update data
   * @returns {Object} Result object
   */
  async updateUndertaking(undertakingId, data) {
    const { title, description, content, deadline } = data;

    const updates = {
      title,
      description,
      content,
      deadline,
      updatedAt: new Date(),
    };

    const undertaking = await Undertaking.findByIdAndUpdate(undertakingId, updates, { new: true });

    if (!undertaking) {
      return {
        success: false,
        statusCode: 404,
        message: 'Undertaking not found',
      };
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
          updatedAt: undertaking.updatedAt,
        },
      },
    };
  }

  /**
   * Delete an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @returns {Object} Result object
   */
  async deleteUndertaking(undertakingId) {
    const undertaking = await Undertaking.findByIdAndDelete(undertakingId);

    if (!undertaking) {
      return {
        success: false,
        statusCode: 404,
        message: 'Undertaking not found',
      };
    }

    // Delete all assignments related to this undertaking
    await UndertakingAssignment.deleteMany({ undertakingId });

    return {
      success: true,
      statusCode: 200,
      message: 'Undertaking deleted successfully',
      data: { undertakingId },
    };
  }

  /**
   * Get students assigned to an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @returns {Object} Result object
   */
  async getAssignedStudents(undertakingId) {
    const assignments = await UndertakingAssignment.find({ undertakingId }).populate({
      path: 'studentId',
      select: '_id rollNumber',
      populate: {
        path: 'userId',
        select: 'name email',
      },
    });

    if (!assignments || assignments.length === 0) {
      return {
        success: true,
        statusCode: 200,
        data: { students: [] },
      };
    }

    const students = assignments.map((assignment) => ({
      id: assignment.studentId._id,
      name: assignment.studentId.userId?.name || '',
      email: assignment.studentId.userId?.email || '',
      rollNumber: assignment.studentId.rollNumber,
      status: assignment.status,
      acceptedAt: assignment.acceptedAt,
    }));

    return {
      success: true,
      statusCode: 200,
      data: { students },
    };
  }

  /**
   * Add students to an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @param {Array} rollNumbers - Array of roll numbers
   * @returns {Object} Result object
   */
  async addStudentsToUndertaking(undertakingId, rollNumbers) {
    console.log('addStudentsToUndertaking');
    console.log(rollNumbers);

    const undertaking = await Undertaking.findById(undertakingId);

    if (!undertaking) {
      return {
        success: false,
        statusCode: 404,
        message: 'Undertaking not found',
      };
    }

    // Find student profiles by roll numbers
    const studentProfiles = await StudentProfile.find({
      rollNumber: { $in: rollNumbers },
    });

    if (studentProfiles.length === 0) {
      return {
        success: false,
        statusCode: 404,
        message: 'No students found with the provided roll numbers',
      };
    }

    // Get student IDs from profiles
    const studentIds = studentProfiles.map((profile) => profile._id);

    // Create assignment entries for each student
    const assignments = studentIds.map((studentId) => ({
      undertakingId,
      studentId,
      status: 'not_viewed',
      assignedAt: new Date(),
    }));

    // Use insertMany with ordered: false to ignore duplicates
    const result = await UndertakingAssignment.insertMany(assignments, { ordered: false }).catch((err) => {
      // If there are duplicate key errors, count how many were successfully inserted
      if (err.code === 11000) {
        return err.insertedDocs || [];
      }
      throw err;
    });

    // Map roll numbers to student profiles for response
    const addedStudents = studentProfiles.map((profile) => ({
      id: profile._id,
      rollNumber: profile.rollNumber,
    }));

    return {
      success: true,
      statusCode: 200,
      message: 'Students added to undertaking successfully',
      data: {
        addedCount: result.length,
        undertakingId,
        addedStudents,
      },
    };
  }

  /**
   * Remove a student from an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @param {string} studentId - Student ID
   * @returns {Object} Result object
   */
  async removeStudentFromUndertaking(undertakingId, studentId) {
    const result = await UndertakingAssignment.findOneAndDelete({
      undertakingId,
      studentId,
    });

    if (!result) {
      return {
        success: false,
        statusCode: 404,
        message: 'Assignment not found',
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Student removed from undertaking successfully',
      data: { undertakingId, studentId },
    };
  }

  /**
   * Get undertaking acceptance status
   * @param {string} undertakingId - Undertaking ID
   * @returns {Object} Result object
   */
  async getUndertakingStatus(undertakingId) {
    const undertaking = await Undertaking.findById(undertakingId);

    if (!undertaking) {
      return {
        success: false,
        statusCode: 404,
        message: 'Undertaking not found',
      };
    }

    const assignments = await UndertakingAssignment.find({ undertakingId }).populate({
      path: 'studentId',
      select: '_id rollNumber',
      populate: {
        path: 'userId',
        select: 'name email',
      },
    });

    // Calculate stats
    const totalStudents = assignments.length;
    const accepted = assignments.filter((a) => a.status === 'accepted').length;
    const pending = assignments.filter((a) => a.status === 'pending').length;
    const notViewed = assignments.filter((a) => a.status === 'not_viewed').length;

    // Format student details
    const students = assignments.map((assignment) => ({
      id: assignment.studentId._id,
      name: assignment.studentId.userId?.name || '',
      email: assignment.studentId.userId?.email || '',
      rollNumber: assignment.studentId.rollNumber,
      status: assignment.status,
      acceptedAt: assignment.acceptedAt,
    }));

    return {
      success: true,
      statusCode: 200,
      data: {
        undertakingId,
        title: undertaking.title,
        stats: {
          totalStudents,
          accepted,
          pending,
          notViewed,
        },
        students,
      },
    };
  }

  // Student APIs

  /**
   * Get student's pending undertakings
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getStudentPendingUndertakings(userId) {
    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student profile not found',
      };
    }

    const assignments = await UndertakingAssignment.find({
      studentId: studentProfile._id,
      status: { $in: ['not_viewed', 'pending'] },
    }).populate('undertakingId');

    const pendingUndertakings = assignments.map((assignment) => ({
      id: assignment.undertakingId._id,
      title: assignment.undertakingId.title,
      description: assignment.undertakingId.description,
      content: assignment.undertakingId.content,
      deadline: assignment.undertakingId.deadline,
      status: assignment.status,
    }));

    return {
      success: true,
      statusCode: 200,
      data: { pendingUndertakings },
    };
  }

  /**
   * Get undertaking details for a student
   * @param {string} undertakingId - Undertaking ID
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getUndertakingDetails(undertakingId, userId) {
    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student profile not found',
      };
    }

    const undertaking = await Undertaking.findById(undertakingId);

    if (!undertaking) {
      return {
        success: false,
        statusCode: 404,
        message: 'Undertaking not found',
      };
    }

    // Find the assignment and update viewedAt if not viewed
    const assignment = await UndertakingAssignment.findOne({
      undertakingId,
      studentId: studentProfile._id,
    });

    if (!assignment) {
      return {
        success: false,
        statusCode: 404,
        message: 'Undertaking not assigned to this student',
      };
    }

    // Mark as viewed if not already
    if (assignment.status === 'not_viewed') {
      assignment.status = 'pending';
      assignment.viewedAt = new Date();
      await assignment.save();
    }

    return {
      success: true,
      statusCode: 200,
      data: {
        undertaking: {
          id: undertaking._id,
          title: undertaking.title,
          description: undertaking.description,
          content: undertaking.content,
          deadline: undertaking.deadline,
          status: assignment.status,
        },
      },
    };
  }

  /**
   * Accept an undertaking
   * @param {string} undertakingId - Undertaking ID
   * @param {boolean} accepted - Acceptance confirmation
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async acceptUndertaking(undertakingId, accepted, userId) {
    if (!accepted) {
      return {
        success: false,
        statusCode: 400,
        message: 'Acceptance confirmation required',
      };
    }

    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student profile not found',
      };
    }

    const assignment = await UndertakingAssignment.findOne({
      undertakingId,
      studentId: studentProfile._id,
    });

    if (!assignment) {
      return {
        success: false,
        statusCode: 404,
        message: 'Undertaking not assigned to this student',
      };
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
      data: {
        undertakingId,
        acceptedAt: assignment.acceptedAt,
      },
    };
  }

  /**
   * Get student's accepted undertakings
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getStudentAcceptedUndertakings(userId) {
    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student profile not found',
      };
    }

    const assignments = await UndertakingAssignment.find({
      studentId: studentProfile._id,
      status: 'accepted',
    }).populate('undertakingId');

    const acceptedUndertakings = assignments.map((assignment) => ({
      id: assignment.undertakingId._id,
      title: assignment.undertakingId.title,
      description: assignment.undertakingId.description,
      acceptedAt: assignment.acceptedAt,
    }));

    return {
      success: true,
      statusCode: 200,
      data: { acceptedUndertakings },
    };
  }

  /**
   * Get count of student's pending undertakings
   * @param {string} userId - User ID
   * @returns {Object} Result object
   */
  async getStudentPendingUndertakingsCount(userId) {
    const studentProfile = await StudentProfile.findOne({ userId });

    if (!studentProfile) {
      return {
        success: false,
        statusCode: 404,
        message: 'Student profile not found',
      };
    }

    const count = await UndertakingAssignment.countDocuments({
      studentId: studentProfile._id,
      status: { $in: ['not_viewed', 'pending'] },
    });

    return {
      success: true,
      statusCode: 200,
      data: { count },
    };
  }
}

export const undertakingService = new UndertakingService();
export default undertakingService;
