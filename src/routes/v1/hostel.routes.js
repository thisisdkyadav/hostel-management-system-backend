/**
 * Hostel Routes
 * Handles hostel rooms, units, and allocations
 * 
 * Base path: /api/hostel
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
} from '../../../controllers/hostelController.js';
import { updateRoomAllocations } from '../../../controllers/studentController.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../middlewares/authorize.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Routes accessible by Admin, Warden, Associate Warden, Hostel Supervisor
router.get(
  '/units/:hostelId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getUnits
);
router.get(
  '/rooms/:unitId',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getRoomsByUnit
);
router.get(
  '/rooms-room-only',
  authorizeRoles(['Admin', 'Warden', 'Associate Warden', 'Hostel Supervisor']),
  getRooms
);

// Admin-only routes below
router.use(authorizeRoles(['Admin']));

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
