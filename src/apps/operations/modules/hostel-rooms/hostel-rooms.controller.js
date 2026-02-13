/**
 * Hostel Rooms Controller
 * Handles room/unit/allocation operations under /api/v1/hostel.
 */

import { hostelRoomsService } from './hostel-rooms.service.js';
import { asyncHandler } from '../../../../utils/index.js';

export const getUnits = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.getUnits(req.params.hostelId, req.user);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json(result.data);
});

export const getRoomsByUnit = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.getRoomsByUnit(req.params.unitId, req.user);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({
    data: result.data,
    message: result.message,
    status: 'success',
    meta: result.meta,
  });
});

export const getRooms = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.getRooms(req.query.hostelId, req.user);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({
    data: result.data,
    message: result.message,
    status: 'success',
    meta: result.meta,
  });
});

export const updateRoomStatus = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.updateRoomStatus(req.params.roomId, req.body.status);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({
    message: result.message,
    updatedRoom: result.data,
  });
});

export const allocateRoom = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.allocateRoom(req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({
    message: result.message,
    success: true,
    allocation: result.data,
  });
});

export const deleteAllocation = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.deleteAllocation(req.params.allocationId);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({ message: result.message, success: true });
});

export const getRoomsForEdit = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.getRoomsForEdit(req.params.hostelId);

  res.status(result.statusCode).json({
    message: result.message,
    success: true,
    meta: result.meta,
    data: result.data,
  });
});

export const updateRoom = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.updateRoom(req.params.roomId, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({
    message: result.message,
    success: true,
  });
});

export const addRooms = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.addRooms(req.params.hostelId, req.body);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({ message: result.message, success: true });
});

export const bulkUpdateRooms = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.bulkUpdateRooms(req.params.hostelId, req.body.rooms);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({
    message: result.message,
    success: true,
    updatedRoomIds: result.data?.updatedRoomIds,
  });
});

export const changeArchiveStatus = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.changeArchiveStatus(req.params.hostelId, req.body.status);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  res.status(result.statusCode).json({ message: result.message, success: true });
});

export const deleteAllAllocations = asyncHandler(async (req, res) => {
  const result = await hostelRoomsService.deleteAllAllocations(req.params.hostelId);
  res.status(result.statusCode).json({ message: result.message });
});
