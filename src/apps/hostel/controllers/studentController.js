/**
 * Student Controller
 * Legacy compatibility exports for student operations.
 *
 * Moved student admin/self handlers now live in:
 * - apps/students/modules/profiles-admin
 * - apps/students/modules/profiles-self
 */

export {
  createStudentsProfiles,
  updateStudentsProfiles,
  updateRoomAllocations,
  getStudents,
  getStudentDetails,
  getMultipleStudentDetails,
  getStudentId,
  updateStudentProfile,
  bulkUpdateStudentsStatus,
  bulkUpdateDayScholarDetails,
} from '../../students/modules/profiles-admin/profiles-admin.controller.js';
export {
  getStudentProfile,
  getStudentDashboard,
  getStudentIdCard,
  uploadStudentIdCard,
} from '../../students/modules/profiles-self/profiles-self.controller.js';
