/**
 * Sheet Controller
 * Handles HTTP requests for spreadsheet/sheet operations.
 * All business logic delegated to sheetService.
 * 
 * @module controllers/sheet
 */

import { sheetService } from '../services/sheet.service.js';
import { asyncHandler } from '../utils/index.js';

/**
 * Get hostel spreadsheet data for TanStack Table
 * Returns flat array with each bed as a separate row
 */
export const getHostelSheetData = asyncHandler(async (req, res) => {
  const { hostelId } = req.params;
  const result = await sheetService.getHostelSheetData(hostelId);

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});

/**
 * Get allocation summary - cross tabulation of degrees vs hostels
 */
export const getAllocationSummary = asyncHandler(async (req, res) => {
  const result = await sheetService.getAllocationSummary();

  return res.status(result.statusCode).json({
    success: result.success,
    message: result.message,
    data: result.data,
  });
});
