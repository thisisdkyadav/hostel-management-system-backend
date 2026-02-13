/**
 * Admin Routes
 * Handles admin operations - staff management, hostels, health, insurance
 * 
 * Base path: /api/admin
 */

import express from 'express';
import {
  addHostel,
  getHostels,
  getHostelList,
  updateHostel,
} from '../controllers/hostelController.js';
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
} from '../controllers/adminController.js';
import {
  createWarden,
  getAllWardens,
  updateWarden,
  deleteWarden,
} from '../../administration/modules/warden/warden.controller.js';
import {
  createAssociateWarden,
  getAllAssociateWardens,
  updateAssociateWarden,
  deleteAssociateWarden,
} from '../../administration/modules/warden/associate-warden.controller.js';
import {
  createHostelSupervisor,
  getAllHostelSupervisors,
  updateHostelSupervisor,
  deleteHostelSupervisor,
} from '../../administration/modules/warden/hostel-supervisor.controller.js';
import {
  getInsuranceProviders,
  createInsuranceProvider,
  updateInsuranceProvider,
  deleteInsuranceProvider,
  updateBulkStudentInsurance,
} from '../controllers/insuranceProviderController.js';
import {
  getHealth,
  updateHealth,
  createInsuranceClaim,
  getInsuranceClaims,
  updateInsuranceClaim,
  deleteInsuranceClaim,
  updateBulkStudentHealth,
} from '../controllers/healthController.js';
import {
  createHostelGate,
  getAllHostelGates,
  updateHostelGate,
  deleteHostelGate,
} from '../controllers/hostelGateController.js';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Public route for authenticated users
router.get('/hostel/list', getHostelList);

// Admin-only routes
router.use(authorizeRoles(['Admin']));

// Hostel management
router.get('/hostels', getHostels);
router.post('/hostel', addHostel);
router.put('/hostel/:id', updateHostel);

// Warden management
router.get('/wardens', getAllWardens);
router.post('/warden', createWarden);
router.put('/warden/:id', updateWarden);
router.delete('/warden/:id', deleteWarden);

// Associate Warden management
router.get('/associate-wardens', getAllAssociateWardens);
router.post('/associate-warden', createAssociateWarden);
router.put('/associate-warden/:id', updateAssociateWarden);
router.delete('/associate-warden/:id', deleteAssociateWarden);

// Hostel Supervisor management
router.get('/hostel-supervisors', getAllHostelSupervisors);
router.post('/hostel-supervisor', createHostelSupervisor);
router.put('/hostel-supervisor/:id', updateHostelSupervisor);
router.delete('/hostel-supervisor/:id', deleteHostelSupervisor);

// Security staff management
router.get('/security', getAllSecurities);
router.post('/security', createSecurity);
router.put('/security/:id', updateSecurity);
router.delete('/security/:id', deleteSecurity);

// Maintenance staff management
router.get('/maintenance', getAllMaintenanceStaff);
router.post('/maintenance', createMaintenanceStaff);
router.put('/maintenance/:id', updateMaintenanceStaff);
router.delete('/maintenance/:id', deleteMaintenanceStaff);
router.get('/maintenance-staff-stats/:staffId', getMaintenanceStaffStats);

// Insurance providers
router.get('/insurance-providers', getInsuranceProviders);
router.post('/insurance-providers', createInsuranceProvider);
router.put('/insurance-providers/:id', updateInsuranceProvider);
router.delete('/insurance-providers/:id', deleteInsuranceProvider);
router.post('/insurance-providers/bulk-student-update', updateBulkStudentInsurance);

// Student health management
router.get('/student/health/:userId', getHealth);
router.put('/student/health/:userId', updateHealth);
router.post('/student/health/bulk-update', updateBulkStudentHealth);

// Insurance claims
router.post('/insurance-claims', createInsuranceClaim);
router.get('/insurance-claims/:userId', getInsuranceClaims);
router.put('/insurance-claims/:id', updateInsuranceClaim);
router.delete('/insurance-claims/:id', deleteInsuranceClaim);

// Hostel gate management
router.post('/hostel-gate', createHostelGate);
router.get('/hostel-gate/all', getAllHostelGates);
router.put('/hostel-gate/:hostelId', updateHostelGate);
router.delete('/hostel-gate/:hostelId', deleteHostelGate);

// User password management
router.post('/user/update-password', updateUserPassword);

// Task statistics
router.get('/task-stats', getTaskStats);

export default router;
