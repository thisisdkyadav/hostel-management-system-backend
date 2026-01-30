/**
 * Hostel Controller
 * Handles HTTP requests and responses for hostel operations.
 * Business logic is delegated to hostelService.
 * 
 * @module controllers/hostelController
 */

import { hostelService } from '../services/hostel.service.js';
import { asyncHandler } from '../utils/index.js';

export const addHostel = asyncHandler(async (req, res) => {
  const result = await hostelService.addHostel(req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    data: result.data,
    success: true,
  });
});

export const getHostels = asyncHandler(async (req, res) => {
  const result = await hostelService.getHostels(req.query.archive);
  res.status(result.statusCode).json(result.data);
});

export const updateHostel = asyncHandler(async (req, res) => {
  const result = await hostelService.updateHostel(req.params.id, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

export const getHostelList = asyncHandler(async (req, res) => {
  const result = await hostelService.getHostelList(req.query.archive);
  res.status(result.statusCode).json(result.data);
});

export const getUnits = asyncHandler(async (req, res) => {
  const result = await hostelService.getUnits(req.params.hostelId, req.user);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json(result.data);
});

export const getRoomsByUnit = asyncHandler(async (req, res) => {
  const result = await hostelService.getRoomsByUnit(req.params.unitId, req.user);
  
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
  const result = await hostelService.getRooms(req.query.hostelId, req.user);
  
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
  const result = await hostelService.updateRoomStatus(req.params.roomId, req.body.status);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ 
    message: result.message, 
    updatedRoom: result.data 
  });
});

export const allocateRoom = asyncHandler(async (req, res) => {
  const result = await hostelService.allocateRoom(req.body);
  
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
  const result = await hostelService.deleteAllocation(req.params.allocationId);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message, success: true });
});

export const getRoomsForEdit = asyncHandler(async (req, res) => {
  const result = await hostelService.getRoomsForEdit(req.params.hostelId);
  
  res.status(result.statusCode).json({
    message: result.message,
    success: true,
    meta: result.meta,
    data: result.data,
  });
});

export const updateRoom = asyncHandler(async (req, res) => {
  const result = await hostelService.updateRoom(req.params.roomId, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({
    message: result.message,
    success: true,
  });
});

export const addRooms = asyncHandler(async (req, res) => {
  const result = await hostelService.addRooms(req.params.hostelId, req.body);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message, success: true });
});

export const bulkUpdateRooms = asyncHandler(async (req, res) => {
  const result = await hostelService.bulkUpdateRooms(req.params.hostelId, req.body.rooms);
  
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
  const result = await hostelService.changeArchiveStatus(req.params.hostelId, req.body.status);
  
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  
  res.status(result.statusCode).json({ message: result.message, success: true });
});

export const deleteAllAllocations = asyncHandler(async (req, res) => {
  const result = await hostelService.deleteAllAllocations(req.params.hostelId);
  res.status(result.statusCode).json({ message: result.message });
});
