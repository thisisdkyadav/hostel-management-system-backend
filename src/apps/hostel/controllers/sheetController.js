/**
 * Sheet Controller
 * Handles HTTP requests for spreadsheet/sheet operations.
 * All business logic delegated to sheetService.
 * 
 * @module controllers/sheet
 */

import { sheetService } from '../services/sheet.service.js';
import { asyncHandler } from '../../../utils/index.js';

/**
 * Get hostel spreadsheet data for TanStack Table
 * Returns flat array with each bed as a separate row
 */
export const getHostelSheetData = asyncHandler(async (req, res) => {
  const { hostelId } = req.params;
  const result = await sheetService.getHostelSheetData(hostelId);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  // Return flattened structure matching old response format
  return res.status(result.statusCode).json({
    success: true,
    hostel: result.data.hostel,
    columns: result.data.columns,
    totalRows: result.data.totalRows,
    data: result.data.data,
  });
});

/**
 * Get allocation summary - cross tabulation of degrees vs hostels
 */
export const getAllocationSummary = asyncHandler(async (req, res) => {
  const result = await sheetService.getAllocationSummary();

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }

  // Return flattened structure matching old response format
  return res.status(result.statusCode).json({
    success: true,
    headers: result.data.headers,
    columns: result.data.columns,
    data: result.data.data,
    grandTotal: result.data.grandTotal,
    hostelCount: result.data.hostelCount,
    degreeCount: result.data.degreeCount,
  });
});
