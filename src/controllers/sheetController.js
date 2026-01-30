/**
 * Sheet Controller
 * Handles HTTP requests for spreadsheet/sheet operations.
 * All business logic delegated to sheetService.
 * 
 * @module controllers/sheet
 */

import { sheetService } from '../services/sheet.service.js';

/**
 * Get hostel spreadsheet data for TanStack Table
 * Returns flat array with each bed as a separate row
 */
export const getHostelSheetData = async (req, res) => {
  try {
    const { hostelId } = req.params;
    const result = await sheetService.getHostelSheetData(hostelId);

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Error in getHostelSheetData:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching hostel sheet data',
    });
  }
};

/**
 * Get allocation summary - cross tabulation of degrees vs hostels
 */
export const getAllocationSummary = async (req, res) => {
  try {
    const result = await sheetService.getAllocationSummary();

    return res.status(result.statusCode).json({
      success: result.success,
      message: result.message,
      data: result.data,
    });
  } catch (error) {
    console.error('Error in getAllocationSummary:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching allocation summary',
    });
  }
};
