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
import { updateRoomAllocations } from '../../../students/modules/profiles-admin/profiles-admin.controller.js';
import { authenticate } from '../../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { requireAnyCapability, requireRouteAccess } from '../../../../middlewares/authz.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

const HOSTEL_ROUTE_KEY_BY_ROLE = {
  Admin: 'route.admin.hostels',
  Warden: 'route.warden.hostels',
  'Associate Warden': 'route.associateWarden.hostels',
  'Hostel Supervisor': 'route.hostelSupervisor.hostels',
};

const requireHostelRouteAccess = (req, res, next) => {
  const routeKey = HOSTEL_ROUTE_KEY_BY_ROLE[req?.user?.role];
  if (!routeKey) {
    return res.status(403).json({ success: false, message: 'You do not have access to this route' });
  }
  return requireRouteAccess(routeKey)(req, res, next);
};

// Routes accessible by Admin, Warden, Associate Warden, Hostel Supervisor
router.get(
  '/units/:hostelId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireHostelRouteAccess,
  requireAnyCapability(['cap.hostels.view']),
  getUnits
);
router.get(
  '/rooms/:unitId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireHostelRouteAccess,
  requireAnyCapability(['cap.hostels.view']),
  getRoomsByUnit
);
router.get(
  '/rooms-room-only',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  requireHostelRouteAccess,
  requireAnyCapability(['cap.hostels.view']),
  getRooms
);

// Admin-only routes below
router.use(authorizeRoles(['Admin']));
router.use(requireRouteAccess('route.admin.hostels'));
router.use(requireAnyCapability(['cap.hostels.manage']));

// Room allocation
router.post('/allocate', allocateRoom);

// Room management
router.get('/rooms/:hostelId/edit', getRoomsForEdit);
router.post('/rooms/:hostelId/add', addRooms);
router.put('/rooms/status/:roomId', updateRoomStatus);
router.put('/rooms/:hostelId/bulk-update', bulkUpdateRooms);
router.put('/rooms/:hostelId/:roomId', updateRoom);

// Allocation management
router.delete('/deallocate/:allocationId', deleteAllocation);
router.put('/update-allocations/:hostelId', updateRoomAllocations);
router.delete('/delete-all-allocations/:hostelId', deleteAllAllocations);

// Hostel archive
router.put('/archive/:hostelId', changeArchiveStatus);

export default router;
