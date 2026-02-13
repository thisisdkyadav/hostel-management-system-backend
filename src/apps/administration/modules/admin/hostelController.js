/**
 * Hostel Controller
 * Handles admin hostel master-data operations.
 *
 * @module controllers/hostelController
 */

import { hostelService } from './hostel.service.js';
import { asyncHandler } from '../../../../utils/index.js';

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
