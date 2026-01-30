/**
 * Hostel Controller
 * Handles HTTP requests and responses for hostel operations.
 * Business logic is delegated to hostelService.
 * 
 * @module controllers/hostelController
 */

import { hostelService } from '../services/hostel.service.js';

export const addHostel = async (req, res) => {
  try {
    const result = await hostelService.addHostel(req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      data: result.data,
      success: true,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error adding hostel', error: error.message });
  }
};

export const getHostels = async (req, res) => {
  try {
    const result = await hostelService.getHostels(req.query.archive);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching hostels', error: error.message });
  }
};

export const updateHostel = async (req, res) => {
  try {
    const result = await hostelService.updateHostel(req.params.id, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Error updating hostel', error: error.message });
  }
};

export const getHostelList = async (req, res) => {
  try {
    const result = await hostelService.getHostelList(req.query.archive);
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching hostels', error: error.message });
  }
};

export const getUnits = async (req, res) => {
  try {
    const result = await hostelService.getUnits(req.params.hostelId, req.user);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching units', error: error.message });
  }
};

export const getRoomsByUnit = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ message: 'Error fetching rooms', error: error.message });
  }
};

export const getRooms = async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ message: 'Error fetching rooms', error: error.message });
  }
};

export const updateRoomStatus = async (req, res) => {
  try {
    const result = await hostelService.updateRoomStatus(req.params.roomId, req.body.status);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ 
      message: result.message, 
      updatedRoom: result.data 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating room status', error: error.message });
  }
};

export const allocateRoom = async (req, res) => {
  try {
    const result = await hostelService.allocateRoom(req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      success: true,
      allocation: result.data,
    });
  } catch (error) {
    console.error('Room allocation error:', error);
    res.status(500).json({ message: 'Error allocating room', error: error.message });
  }
};

export const deleteAllocation = async (req, res) => {
  try {
    const result = await hostelService.deleteAllocation(req.params.allocationId);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message, success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error deallocating room', error: error.message });
  }
};

export const getRoomsForEdit = async (req, res) => {
  try {
    const result = await hostelService.getRoomsForEdit(req.params.hostelId);
    
    res.status(result.statusCode).json({
      message: result.message,
      success: true,
      meta: result.meta,
      data: result.data,
    });
  } catch (error) {
    console.error('Error fetching room details:', error);
    res.status(500).json({ message: 'Error fetching room details', error: error.message });
  }
};

export const updateRoom = async (req, res) => {
  try {
    const result = await hostelService.updateRoom(req.params.roomId, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      success: true,
    });
  } catch (error) {
    console.error('Error updating room:', error);
    res.status(500).json({ message: 'Error updating room', error: error.message });
  }
};

export const addRooms = async (req, res) => {
  try {
    const result = await hostelService.addRooms(req.params.hostelId, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message, success: true });
  } catch (error) {
    console.error('Error adding room:', error);
    res.status(500).json({ message: 'Error adding room', error: error.message });
  }
};

export const bulkUpdateRooms = async (req, res) => {
  try {
    const result = await hostelService.bulkUpdateRooms(req.params.hostelId, req.body.rooms);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({
      message: result.message,
      success: true,
      updatedRoomIds: result.data?.updatedRoomIds,
    });
  } catch (error) {
    console.error('Error updating rooms:', error);
    res.status(500).json({ message: 'Error updating rooms', error: error.message });
  }
};

export const changeArchiveStatus = async (req, res) => {
  try {
    const result = await hostelService.changeArchiveStatus(req.params.hostelId, req.body.status);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json({ message: result.message, success: true });
  } catch (error) {
    console.error('Error updating hostel archive status:', error);
    res.status(500).json({ message: 'Error updating hostel archive status', error: error.message });
  }
};

export const deleteAllAllocations = async (req, res) => {
  try {
    const result = await hostelService.deleteAllAllocations(req.params.hostelId);
    res.status(result.statusCode).json({ message: result.message });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
