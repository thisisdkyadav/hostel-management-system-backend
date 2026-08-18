/**
 * Hostel Routes
 * Handles hostel rooms, units, and allocations
 * 
 * Base path: /api/v1/hostel
 */

import express from 'express';
import {
  getRooms,
  getRoomsForEdit,
  bulkUpdateRooms,
  addRooms,
  updateRoom,
  getUnits,
  getRoomsByUnit,
  allocateRoom,
  updateRoomStatus,
  deleteAllocation,
  changeArchiveStatus,
  deleteAllAllocations,
} from './hostel-rooms.controller.js';
import { updateRoomAllocations } from '../../../students/modules/profiles-admin/profiles-admin.allocations.module.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireRouteAccess } from '../../../../middlewares/authz.middleware.js';
import { routeGuard } from '../../../../lib/api-kit/index.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const guard = routeGuard({
  Admin: 'route.admin.hostels',
  Warden: 'route.warden.hostels',
  'Associate Warden': 'route.associateWarden.hostels',
  'Hostel Supervisor': 'route.hostelSupervisor.hostels',
});

// Routes accessible by Admin, Warden, Associate Warden, Hostel Supervisor
router.get(
  '/units/:hostelId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getUnits
);
router.get(
  '/rooms/:unitId',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getRoomsByUnit
);
router.get(
  '/rooms-room-only',
  guard(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getRooms
);

// Bulk allocation update: Admin + Hostel Supervisor. Handler enforces active-hostel
// and student-eligibility scope for hostel-bound roles.
router.put(
  '/update-allocations/:hostelId',
  guard(['Admin', 'Hostel Supervisor']),
  updateRoomAllocations
);

// Single-room allocate / deallocate: Admin + Hostel Supervisor. Handler enforces
// active-hostel scope for hostel-bound roles (target room/allocation only).
router.post(
  '/allocate',
  guard(['Admin', 'Hostel Supervisor']),
  allocateRoom
);
router.delete(
  '/deallocate/:allocationId',
  guard(['Admin', 'Hostel Supervisor']),
  deleteAllocation
);

// Status / capacity: Admin + Hostel Supervisor. Handler enforces active-hostel
// scope for hostel-bound roles.
router.put(
  '/rooms/status/:roomId',
  guard(['Admin', 'Hostel Supervisor']),
  updateRoomStatus
);
router.put(
  '/rooms/:hostelId/:roomId',
  guard(['Admin', 'Hostel Supervisor']),
  updateRoom
);

// Admin-only routes below
router.use(authorizeRoles(['Admin']));
router.use(requireRouteAccess('route.admin.hostels'));

// Room management
router.get('/rooms/:hostelId/edit', getRoomsForEdit);
router.post('/rooms/:hostelId/add', addRooms);
router.put('/rooms/:hostelId/bulk-update', bulkUpdateRooms);

// Allocation management
router.delete('/delete-all-allocations/:hostelId', deleteAllAllocations);

// Hostel archive
router.put('/archive/:hostelId', changeArchiveStatus);

export default router;
