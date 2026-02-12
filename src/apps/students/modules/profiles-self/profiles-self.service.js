/**
 * Profiles Self Service
 * Delegates student self-service profile/dashboard flows to legacy student service.
 */

import { studentService as legacyStudentService } from '../../../hostel/services/student.service.js';

class ProfilesSelfService {
  getStudentProfile(userId) {
    return legacyStudentService.getStudentProfile(userId);
  }

  getStudentDashboard(userId) {
    return legacyStudentService.getStudentDashboard(userId);
  }

  getStudentIdCard(userId, currentUser) {
    return legacyStudentService.getStudentIdCard(userId, currentUser);
  }

  uploadStudentIdCard(currentUser, idCardData) {
    return legacyStudentService.uploadStudentIdCard(currentUser, idCardData);
  }
}

export const profilesSelfService = new ProfilesSelfService();
