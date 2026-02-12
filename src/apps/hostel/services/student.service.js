/**
 * Legacy Student Service Facade
 *
 * Source of truth has moved to:
 * - apps/students/modules/profiles-admin
 * - apps/students/modules/profiles-self
 *
 * This facade is retained for backward compatibility only.
 */

import { profilesAdminService } from '../../students/modules/profiles-admin/profiles-admin.service.js';
import { profilesSelfService } from '../../students/modules/profiles-self/profiles-self.service.js';

class StudentService {
  createStudentsProfiles(studentsData) {
    return profilesAdminService.createStudentsProfiles(studentsData);
  }

  updateStudentsProfiles(studentsData, currentUser) {
    return profilesAdminService.updateStudentsProfiles(studentsData, currentUser);
  }

  updateRoomAllocations(hostelId, allocationsData) {
    return profilesAdminService.updateRoomAllocations(hostelId, allocationsData);
  }

  getStudents(query, user) {
    return profilesAdminService.getStudents(query, user);
  }

  getStudentDetails(userId) {
    return profilesAdminService.getStudentDetails(userId);
  }

  getMultipleStudentDetails(userIds) {
    return profilesAdminService.getMultipleStudentDetails(userIds);
  }

  getStudentId(userId) {
    return profilesAdminService.getStudentId(userId);
  }

  updateStudentProfile(userId, updateData) {
    return profilesAdminService.updateStudentProfile(userId, updateData);
  }

  bulkUpdateStudentsStatus(status, rollNumbers) {
    return profilesAdminService.bulkUpdateStudentsStatus(status, rollNumbers);
  }

  bulkUpdateDayScholarDetails(data) {
    return profilesAdminService.bulkUpdateDayScholarDetails(data);
  }

  getStudentProfile(userId) {
    return profilesSelfService.getStudentProfile(userId);
  }

  getStudentDashboard(userId) {
    return profilesSelfService.getStudentDashboard(userId);
  }

  getStudentIdCard(userId, currentUser) {
    return profilesSelfService.getStudentIdCard(userId, currentUser);
  }

  uploadStudentIdCard(currentUser, idCardData) {
    return profilesSelfService.uploadStudentIdCard(currentUser, idCardData);
  }
}

export const studentService = new StudentService();
export default studentService;
