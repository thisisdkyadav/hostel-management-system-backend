/**
 * Admin Routes
 * Handles admin operations - staff management, hostels, health, insurance
 * 
 * Base path: /api/v1/admin
 */

import express from 'express';
import {
  addHostel,
  getHostels,
  getHostelList,
  updateHostel,
} from './hostelController.js';
import {
  createSecurity,
  getAllSecurities,
  updateSecurity,
  updateUserPassword,
  deleteSecurity,
  createMaintenanceStaff,
  getAllMaintenanceStaff,
  updateMaintenanceStaff,
  deleteMaintenanceStaff,
  getTaskStats,
  getMaintenanceStaffStats,
} from './adminController.js';
import {
  createWarden,
  getAllWardens,
  updateWarden,
  deleteWarden,
} from '../warden/warden.controller.js';
import {
  createAssociateWarden,
  getAllAssociateWardens,
  updateAssociateWarden,
  deleteAssociateWarden,
} from '../warden/associate-warden.controller.js';
import {
  createHostelSupervisor,
  getAllHostelSupervisors,
  updateHostelSupervisor,
  deleteHostelSupervisor,
} from '../warden/hostel-supervisor.controller.js';
import {
  getInsuranceProviders,
  createInsuranceProvider,
  updateInsuranceProvider,
  deleteInsuranceProvider,
  updateBulkStudentInsurance,
} from './insuranceProviderController.js';
import {
  getHealth,
  updateHealth,
  createInsuranceClaim,
  getInsuranceClaims,
  updateInsuranceClaim,
  deleteInsuranceClaim,
  updateBulkStudentHealth,
} from './healthController.js';
import {
  createHostelGate,
  getAllHostelGates,
  updateHostelGate,
  deleteHostelGate,
} from './hostelGateController.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Public route for authenticated users
router.get('/hostel/list', getHostelList);

// Admin-only routes
router.use(authorizeRoles(['Admin']));

// Admin profile
router.get('/profile', requireRouteAccess('route.admin.profile'), requireAnyCapability(['cap.profile.self.view']), (req, res) => {
  res.json({
    success: true,
    data: {
      profile: req.user,
    },
  });
});

// Hostel management
router.get('/hostels', requireRouteAccess('route.admin.hostels'), requireAnyCapability(['cap.hostels.view']), getHostels);
router.post('/hostel', requireRouteAccess('route.admin.hostels'), requireAnyCapability(['cap.hostels.manage']), addHostel);
router.put('/hostel/:id', requireRouteAccess('route.admin.hostels'), requireAnyCapability(['cap.hostels.manage']), updateHostel);

// Warden management
router.get('/wardens', requireRouteAccess('route.admin.wardens'), requireAnyCapability(['cap.users.view']), getAllWardens);
router.post('/warden', requireRouteAccess('route.admin.wardens'), requireAnyCapability(['cap.users.create']), createWarden);
router.put('/warden/:id', requireRouteAccess('route.admin.wardens'), requireAnyCapability(['cap.users.edit']), updateWarden);
router.delete('/warden/:id', requireRouteAccess('route.admin.wardens'), requireAnyCapability(['cap.users.delete']), deleteWarden);

// Associate Warden management
router.get('/associate-wardens', requireRouteAccess('route.admin.associateWardens'), requireAnyCapability(['cap.users.view']), getAllAssociateWardens);
router.post('/associate-warden', requireRouteAccess('route.admin.associateWardens'), requireAnyCapability(['cap.users.create']), createAssociateWarden);
router.put('/associate-warden/:id', requireRouteAccess('route.admin.associateWardens'), requireAnyCapability(['cap.users.edit']), updateAssociateWarden);
router.delete('/associate-warden/:id', requireRouteAccess('route.admin.associateWardens'), requireAnyCapability(['cap.users.delete']), deleteAssociateWarden);

// Hostel Supervisor management
router.get('/hostel-supervisors', requireRouteAccess('route.admin.hostelSupervisors'), requireAnyCapability(['cap.users.view']), getAllHostelSupervisors);
router.post('/hostel-supervisor', requireRouteAccess('route.admin.hostelSupervisors'), requireAnyCapability(['cap.users.create']), createHostelSupervisor);
router.put('/hostel-supervisor/:id', requireRouteAccess('route.admin.hostelSupervisors'), requireAnyCapability(['cap.users.edit']), updateHostelSupervisor);
router.delete('/hostel-supervisor/:id', requireRouteAccess('route.admin.hostelSupervisors'), requireAnyCapability(['cap.users.delete']), deleteHostelSupervisor);

// Security staff management
router.get('/security', requireRouteAccess('route.admin.security'), requireAnyCapability(['cap.users.view']), getAllSecurities);
router.post('/security', requireRouteAccess('route.admin.security'), requireAnyCapability(['cap.users.create']), createSecurity);
router.put('/security/:id', requireRouteAccess('route.admin.security'), requireAnyCapability(['cap.users.edit']), updateSecurity);
router.delete('/security/:id', requireRouteAccess('route.admin.security'), requireAnyCapability(['cap.users.delete']), deleteSecurity);

// Maintenance staff management
router.get('/maintenance', requireRouteAccess('route.admin.maintenance'), requireAnyCapability(['cap.users.view']), getAllMaintenanceStaff);
router.post('/maintenance', requireRouteAccess('route.admin.maintenance'), requireAnyCapability(['cap.users.create']), createMaintenanceStaff);
router.put('/maintenance/:id', requireRouteAccess('route.admin.maintenance'), requireAnyCapability(['cap.users.edit']), updateMaintenanceStaff);
router.delete('/maintenance/:id', requireRouteAccess('route.admin.maintenance'), requireAnyCapability(['cap.users.delete']), deleteMaintenanceStaff);
router.get('/maintenance-staff-stats/:staffId', requireRouteAccess('route.admin.maintenance'), requireAnyCapability(['cap.users.view']), getMaintenanceStaffStats);

// Insurance providers
router.get('/insurance-providers', requireRouteAccess('route.admin.settings'), requireAnyCapability(['cap.settings.view']), getInsuranceProviders);
router.post('/insurance-providers', requireRouteAccess('route.admin.settings'), requireAnyCapability(['cap.settings.update']), createInsuranceProvider);
router.put('/insurance-providers/:id', requireRouteAccess('route.admin.settings'), requireAnyCapability(['cap.settings.update']), updateInsuranceProvider);
router.delete('/insurance-providers/:id', requireRouteAccess('route.admin.settings'), requireAnyCapability(['cap.settings.update']), deleteInsuranceProvider);
router.post('/insurance-providers/bulk-student-update', requireRouteAccess('route.admin.students'), requireAnyCapability(['cap.students.edit.health']), updateBulkStudentInsurance);

// Student health management
router.get('/student/health/:userId', requireRouteAccess('route.admin.students'), requireAnyCapability(['cap.students.detail.view']), getHealth);
router.put('/student/health/:userId', requireRouteAccess('route.admin.students'), requireAnyCapability(['cap.students.edit.health']), updateHealth);
router.post('/student/health/bulk-update', requireRouteAccess('route.admin.students'), requireAnyCapability(['cap.students.edit.health']), updateBulkStudentHealth);

// Insurance claims
router.post('/insurance-claims', requireRouteAccess('route.admin.students'), requireAnyCapability(['cap.students.edit.health']), createInsuranceClaim);
router.get('/insurance-claims/:userId', requireRouteAccess('route.admin.students'), requireAnyCapability(['cap.students.detail.view']), getInsuranceClaims);
router.put('/insurance-claims/:id', requireRouteAccess('route.admin.students'), requireAnyCapability(['cap.students.edit.health']), updateInsuranceClaim);
router.delete('/insurance-claims/:id', requireRouteAccess('route.admin.students'), requireAnyCapability(['cap.students.edit.health']), deleteInsuranceClaim);

// Hostel gate management
router.post('/hostel-gate', requireRouteAccess('route.admin.security'), requireAnyCapability(['cap.users.create']), createHostelGate);
router.get('/hostel-gate/all', requireRouteAccess('route.admin.security'), requireAnyCapability(['cap.users.view']), getAllHostelGates);
router.put('/hostel-gate/:hostelId', requireRouteAccess('route.admin.security'), requireAnyCapability(['cap.users.edit']), updateHostelGate);
router.delete('/hostel-gate/:hostelId', requireRouteAccess('route.admin.security'), requireAnyCapability(['cap.users.delete']), deleteHostelGate);

// User password management
router.post('/user/update-password', requireRouteAccess('route.admin.updatePassword'), requireAnyCapability(['cap.users.edit']), updateUserPassword);

// Task statistics
router.get('/task-stats', requireRouteAccess('route.admin.taskManagement'), requireAnyCapability(['cap.tasks.view']), getTaskStats);

export default router;
