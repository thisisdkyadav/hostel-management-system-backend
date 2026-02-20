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
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Public route for authenticated users
router.get('/hostel/list', getHostelList);

// Admin-only routes
router.use(authorizeRoles(['Admin']));

// Admin profile
router.get('/profile', requireRouteAccess('route.admin.profile'), (req, res) => {
  res.json({
    success: true,
    data: {
      profile: req.user,
    },
  });
});

// Hostel management
router.get('/hostels', requireRouteAccess('route.admin.hostels'), getHostels);
router.post('/hostel', requireRouteAccess('route.admin.hostels'), addHostel);
router.put('/hostel/:id', requireRouteAccess('route.admin.hostels'), updateHostel);

// Warden management
router.get('/wardens', requireRouteAccess('route.admin.wardens'), getAllWardens);
router.post('/warden', requireRouteAccess('route.admin.wardens'), createWarden);
router.put('/warden/:id', requireRouteAccess('route.admin.wardens'), updateWarden);
router.delete('/warden/:id', requireRouteAccess('route.admin.wardens'), deleteWarden);

// Associate Warden management
router.get('/associate-wardens', requireRouteAccess('route.admin.associateWardens'), getAllAssociateWardens);
router.post('/associate-warden', requireRouteAccess('route.admin.associateWardens'), createAssociateWarden);
router.put('/associate-warden/:id', requireRouteAccess('route.admin.associateWardens'), updateAssociateWarden);
router.delete('/associate-warden/:id', requireRouteAccess('route.admin.associateWardens'), deleteAssociateWarden);

// Hostel Supervisor management
router.get('/hostel-supervisors', requireRouteAccess('route.admin.hostelSupervisors'), getAllHostelSupervisors);
router.post('/hostel-supervisor', requireRouteAccess('route.admin.hostelSupervisors'), createHostelSupervisor);
router.put('/hostel-supervisor/:id', requireRouteAccess('route.admin.hostelSupervisors'), updateHostelSupervisor);
router.delete('/hostel-supervisor/:id', requireRouteAccess('route.admin.hostelSupervisors'), deleteHostelSupervisor);

// Security staff management
router.get('/security', requireRouteAccess('route.admin.security'), getAllSecurities);
router.post('/security', requireRouteAccess('route.admin.security'), createSecurity);
router.put('/security/:id', requireRouteAccess('route.admin.security'), updateSecurity);
router.delete('/security/:id', requireRouteAccess('route.admin.security'), deleteSecurity);

// Maintenance staff management
router.get('/maintenance', requireRouteAccess('route.admin.maintenance'), getAllMaintenanceStaff);
router.post('/maintenance', requireRouteAccess('route.admin.maintenance'), createMaintenanceStaff);
router.put('/maintenance/:id', requireRouteAccess('route.admin.maintenance'), updateMaintenanceStaff);
router.delete('/maintenance/:id', requireRouteAccess('route.admin.maintenance'), deleteMaintenanceStaff);
router.get('/maintenance-staff-stats/:staffId', requireRouteAccess('route.admin.maintenance'), getMaintenanceStaffStats);

// Insurance providers
router.get('/insurance-providers', requireRouteAccess('route.admin.settings'), getInsuranceProviders);
router.post('/insurance-providers', requireRouteAccess('route.admin.settings'), createInsuranceProvider);
router.put('/insurance-providers/:id', requireRouteAccess('route.admin.settings'), updateInsuranceProvider);
router.delete('/insurance-providers/:id', requireRouteAccess('route.admin.settings'), deleteInsuranceProvider);
router.post('/insurance-providers/bulk-student-update', requireRouteAccess('route.admin.students'), updateBulkStudentInsurance);

// Student health management
router.get('/student/health/:userId', requireRouteAccess('route.admin.students'), getHealth);
router.put('/student/health/:userId', requireRouteAccess('route.admin.students'), updateHealth);
router.post('/student/health/bulk-update', requireRouteAccess('route.admin.students'), updateBulkStudentHealth);

// Insurance claims
router.post('/insurance-claims', requireRouteAccess('route.admin.students'), createInsuranceClaim);
router.get('/insurance-claims/:userId', requireRouteAccess('route.admin.students'), getInsuranceClaims);
router.put('/insurance-claims/:id', requireRouteAccess('route.admin.students'), updateInsuranceClaim);
router.delete('/insurance-claims/:id', requireRouteAccess('route.admin.students'), deleteInsuranceClaim);

// Hostel gate management
router.post('/hostel-gate', requireRouteAccess('route.admin.security'), createHostelGate);
router.get('/hostel-gate/all', requireRouteAccess('route.admin.security'), getAllHostelGates);
router.put('/hostel-gate/:hostelId', requireRouteAccess('route.admin.security'), updateHostelGate);
router.delete('/hostel-gate/:hostelId', requireRouteAccess('route.admin.security'), deleteHostelGate);

// User password management
router.post('/user/update-password', requireRouteAccess('route.admin.updatePassword'), updateUserPassword);

// Task statistics
router.get('/task-stats', requireRouteAccess('route.admin.taskManagement'), getTaskStats);

export default router;
