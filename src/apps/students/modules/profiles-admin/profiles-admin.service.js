/**
 * Profiles Admin Service
 * Delegates student admin/profile-management use cases to legacy student service.
 * This keeps behavior stable during modular extraction.
 */

import { studentService as legacyStudentService } from '../../../hostel/services/student.service.js';

class ProfilesAdminService {
  createStudentsProfiles(studentsData) {
    return legacyStudentService.createStudentsProfiles(studentsData);
  }

  updateStudentsProfiles(studentsData, currentUser) {
    return legacyStudentService.updateStudentsProfiles(studentsData, currentUser);
  }

  updateRoomAllocations(hostelId, allocationsData) {
    return legacyStudentService.updateRoomAllocations(hostelId, allocationsData);
  }

  getStudents(query, user) {
    return legacyStudentService.getStudents(query, user);
  }

  getStudentDetails(userId) {
    return legacyStudentService.getStudentDetails(userId);
  }

  getMultipleStudentDetails(userIds) {
    return legacyStudentService.getMultipleStudentDetails(userIds);
  }

  getStudentId(userId) {
    return legacyStudentService.getStudentId(userId);
  }

  updateStudentProfile(userId, updateData) {
    return legacyStudentService.updateStudentProfile(userId, updateData);
  }

  bulkUpdateStudentsStatus(status, rollNumbers) {
    return legacyStudentService.bulkUpdateStudentsStatus(status, rollNumbers);
  }

  bulkUpdateDayScholarDetails(data) {
    return legacyStudentService.bulkUpdateDayScholarDetails(data);
  }
}

export const profilesAdminService = new ProfilesAdminService();
