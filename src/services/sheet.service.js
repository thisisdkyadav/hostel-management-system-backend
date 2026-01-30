/**
 * Sheet Service
 * Contains all business logic for spreadsheet/sheet operations.
 * 
 * @module services/sheet
 */

import Hostel from '../../models/Hostel.js';
import Unit from '../../models/Unit.js';
import Room from '../../models/Room.js';
import RoomAllocation from '../../models/RoomAllocation.js';

class SheetService {
  /**
   * Get hostel spreadsheet data for TanStack Table
   * Returns flat array with each bed as a separate row
   * @param {string} hostelId - Hostel ID
   * @returns {Object} Result object
   */
  async getHostelSheetData(hostelId) {
    if (!hostelId) {
      return {
        success: false,
        statusCode: 400,
        message: 'Hostel ID is required',
      };
    }

    // Verify hostel exists and get its type
    const hostel = await Hostel.findById(hostelId);
    if (!hostel) {
      return {
        success: false,
        statusCode: 404,
        message: 'Hostel not found',
      };
    }

    const isUnitBased = hostel.type === 'unit-based';

    let sheetData = [];

    if (isUnitBased) {
      // For unit-based hostels: fetch units with rooms
      const units = await Unit.find({ hostelId })
        .sort({ unitNumber: 1 })
        .lean();

      const unitIds = units.map((u) => u._id);

      // Get all rooms for these units
      const rooms = await Room.find({ hostelId, unitId: { $in: unitIds } })
        .sort({ roomNumber: 1 })
        .lean();

      // Get all allocations for this hostel
      const allocations = await RoomAllocation.find({ hostelId })
        .populate({
          path: 'studentProfileId',
          select: 'rollNumber department degree gender admissionDate guardian guardianPhone status isDayScholar',
          populate: {
            path: 'userId',
            select: 'name email phone profileImage',
          },
        })
        .lean();

      // Create a map for quick allocation lookup: roomId_bedNumber -> allocation
      const allocationMap = new Map();
      allocations.forEach((alloc) => {
        const key = `${alloc.roomId.toString()}_${alloc.bedNumber}`;
        allocationMap.set(key, alloc);
      });

      // Build flat data structure
      for (const unit of units) {
        const unitRooms = rooms
          .filter((r) => r.unitId.toString() === unit._id.toString())
          .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true }));

        for (const room of unitRooms) {
          // For inactive rooms, add single row with bedNumber 0
          if (room.status === 'Inactive') {
            const row = this._buildSheetRow(unit, room, 0, null, true);
            sheetData.push(row);
          } else {
            // For active rooms, create a row for each bed (1 to capacity)
            for (let bedNumber = 1; bedNumber <= room.capacity; bedNumber++) {
              const allocationKey = `${room._id.toString()}_${bedNumber}`;
              const allocation = allocationMap.get(allocationKey);
              const row = this._buildSheetRow(unit, room, bedNumber, allocation, true);
              sheetData.push(row);
            }
          }
        }
      }
    } else {
      // For room-only hostels: fetch rooms directly
      const rooms = await Room.find({ hostelId })
        .sort({ roomNumber: 1 })
        .lean();

      // Get all allocations for this hostel
      const allocations = await RoomAllocation.find({ hostelId })
        .populate({
          path: 'studentProfileId',
          select: 'rollNumber department degree gender admissionDate guardian guardianPhone status isDayScholar',
          populate: {
            path: 'userId',
            select: 'name email phone profileImage',
          },
        })
        .lean();

      // Create a map for quick allocation lookup: roomId_bedNumber -> allocation
      const allocationMap = new Map();
      allocations.forEach((alloc) => {
        const key = `${alloc.roomId.toString()}_${alloc.bedNumber}`;
        allocationMap.set(key, alloc);
      });

      // Sort rooms numerically
      const sortedRooms = rooms.sort((a, b) =>
        a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true })
      );

      // Build flat data structure
      for (const room of sortedRooms) {
        // For inactive rooms, add single row with bedNumber 0
        if (room.status === 'Inactive') {
          const row = this._buildSheetRow(null, room, 0, null, false);
          sheetData.push(row);
        } else {
          // For active rooms, create a row for each bed (1 to capacity)
          for (let bedNumber = 1; bedNumber <= room.capacity; bedNumber++) {
            const allocationKey = `${room._id.toString()}_${bedNumber}`;
            const allocation = allocationMap.get(allocationKey);
            const row = this._buildSheetRow(null, room, bedNumber, allocation, false);
            sheetData.push(row);
          }
        }
      }
    }

    // Column definitions for TanStack Table
    const columns = this._getColumnDefinitions(isUnitBased);

    return {
      success: true,
      statusCode: 200,
      data: {
        hostel: {
          id: hostel._id,
          name: hostel.name,
          type: hostel.type,
          gender: hostel.gender,
        },
        columns,
        totalRows: sheetData.length,
        data: sheetData,
      },
    };
  }

  /**
   * Build a sheet row object
   * @private
   */
  _buildSheetRow(unit, room, bedNumber, allocation, isUnitBased) {
    const isInactive = room.status === 'Inactive';
    
    let displayRoom;
    if (isUnitBased && unit) {
      displayRoom = isInactive ? `${unit.unitNumber}-${room.roomNumber}` : `${unit.unitNumber}-${room.roomNumber}-${bedNumber}`;
    } else {
      displayRoom = isInactive ? room.roomNumber : `${room.roomNumber}-${bedNumber}`;
    }

    return {
      // Location identifiers
      unitNumber: unit?.unitNumber || null,
      unitFloor: unit?.floor || null,
      roomNumber: room.roomNumber,
      bedNumber: bedNumber,
      displayRoom,
      roomStatus: room.status,
      
      // Room info
      roomId: room._id.toString(),
      unitId: unit?._id?.toString() || null,
      roomCapacity: isInactive ? (room.originalCapacity || 0) : room.capacity,
      roomOccupancy: isInactive ? 0 : room.occupancy,
      
      // Allocation status
      isAllocated: !!allocation,
      allocationId: allocation?._id?.toString() || null,
      
      // Student details (if allocated)
      studentName: allocation?.studentProfileId?.userId?.name || null,
      studentEmail: allocation?.studentProfileId?.userId?.email || null,
      studentPhone: allocation?.studentProfileId?.userId?.phone || null,
      studentProfileImage: allocation?.studentProfileId?.userId?.profileImage || null,
      rollNumber: allocation?.studentProfileId?.rollNumber || null,
      department: allocation?.studentProfileId?.department || null,
      degree: allocation?.studentProfileId?.degree || null,
      gender: allocation?.studentProfileId?.gender || null,
      admissionDate: allocation?.studentProfileId?.admissionDate || null,
      guardian: allocation?.studentProfileId?.guardian || null,
      guardianPhone: allocation?.studentProfileId?.guardianPhone || null,
      studentStatus: allocation?.studentProfileId?.status || null,
      isDayScholar: allocation?.studentProfileId?.isDayScholar || false,
      studentProfileId: allocation?.studentProfileId?._id?.toString() || null,
      userId: allocation?.studentProfileId?.userId?._id?.toString() || null,
    };
  }

  /**
   * Get column definitions for TanStack Table
   * @private
   */
  _getColumnDefinitions(isUnitBased) {
    return [
      // Location columns
      ...(isUnitBased
        ? [
            { accessorKey: 'unitNumber', header: 'Unit', category: 'location' },
            { accessorKey: 'unitFloor', header: 'Floor', category: 'location' },
          ]
        : []),
      { accessorKey: 'roomNumber', header: 'Room', category: 'location' },
      { accessorKey: 'bedNumber', header: 'Bed', category: 'location' },
      { accessorKey: 'displayRoom', header: 'Room Display', category: 'location' },
      { accessorKey: 'roomStatus', header: 'Room Status', category: 'location' },
      
      // Room info columns
      { accessorKey: 'roomCapacity', header: 'Capacity', category: 'room' },
      { accessorKey: 'roomOccupancy', header: 'Occupancy', category: 'room' },
      
      // Allocation columns
      { accessorKey: 'isAllocated', header: 'Allocated', category: 'allocation' },
      
      // Student details columns
      { accessorKey: 'studentName', header: 'Student Name', category: 'student' },
      { accessorKey: 'rollNumber', header: 'Roll Number', category: 'student' },
      { accessorKey: 'studentEmail', header: 'Email', category: 'student' },
      { accessorKey: 'studentPhone', header: 'Phone', category: 'student' },
      { accessorKey: 'department', header: 'Department', category: 'student' },
      { accessorKey: 'degree', header: 'Degree', category: 'student' },
      { accessorKey: 'gender', header: 'Gender', category: 'student' },
      { accessorKey: 'admissionDate', header: 'Admission Date', category: 'student' },
      { accessorKey: 'guardian', header: 'Guardian', category: 'student' },
      { accessorKey: 'guardianPhone', header: 'Guardian Phone', category: 'student' },
      { accessorKey: 'studentStatus', header: 'Student Status', category: 'student' },
      { accessorKey: 'isDayScholar', header: 'Day Scholar', category: 'student' },
      { accessorKey: 'studentProfileImage', header: 'Profile Image', category: 'student' },
      
      // ID columns (hidden by default, useful for actions)
      { accessorKey: 'roomId', header: 'Room ID', category: 'ids', hidden: true },
      { accessorKey: 'unitId', header: 'Unit ID', category: 'ids', hidden: true },
      { accessorKey: 'allocationId', header: 'Allocation ID', category: 'ids', hidden: true },
      { accessorKey: 'studentProfileId', header: 'Student Profile ID', category: 'ids', hidden: true },
      { accessorKey: 'userId', header: 'User ID', category: 'ids', hidden: true },
    ];
  }

  /**
   * Get allocation summary - cross tabulation of degrees vs hostels
   * @returns {Object} Result object
   */
  async getAllocationSummary() {
    // Get all hostels (non-archived)
    const hostels = await Hostel.find({ isArchived: { $ne: true } })
      .sort({ name: 1 })
      .lean();

    if (hostels.length === 0) {
      return {
        success: true,
        statusCode: 200,
        data: {
          headers: ['', 'Total'],
          data: [{ degree: 'Total', Total: 0 }],
          grandTotal: 0,
        },
      };
    }

    // Get all allocations with student profile data
    const allocations = await RoomAllocation.find({})
      .populate({
        path: 'studentProfileId',
        select: 'degree',
      })
      .populate({
        path: 'hostelId',
        select: 'name',
      })
      .lean();

    // Build count matrix: { degree: { hostelName: count } }
    const degreeHostelCount = {};
    const hostelTotals = {};
    const degreeTotals = {};

    // Initialize hostel totals
    hostels.forEach((hostel) => {
      hostelTotals[hostel.name] = 0;
    });

    // Count allocations
    allocations.forEach((alloc) => {
      if (!alloc.hostelId || !alloc.studentProfileId) return;

      const hostelName = alloc.hostelId.name;
      const degree = alloc.studentProfileId.degree || 'Unknown';

      // Initialize degree row if not exists
      if (!degreeHostelCount[degree]) {
        degreeHostelCount[degree] = {};
        degreeTotals[degree] = 0;
      }

      // Initialize cell if not exists
      if (!degreeHostelCount[degree][hostelName]) {
        degreeHostelCount[degree][hostelName] = 0;
      }

      // Increment counts
      degreeHostelCount[degree][hostelName]++;
      hostelTotals[hostelName] = (hostelTotals[hostelName] || 0) + 1;
      degreeTotals[degree]++;
    });

    // Get sorted degree names (put "Unknown" at the end)
    const degreeNames = Object.keys(degreeHostelCount).sort((a, b) => {
      if (a === 'Unknown') return 1;
      if (b === 'Unknown') return -1;
      return a.localeCompare(b);
    });

    // Build headers array: ["", hostel1, hostel2, ..., "Total"]
    const headers = ['', ...hostels.map((h) => h.name), 'Total'];

    // Build data rows
    const data = degreeNames.map((degree) => {
      const row = { degree };

      hostels.forEach((hostel) => {
        row[hostel.name] = degreeHostelCount[degree][hostel.name] || 0;
      });

      row.Total = degreeTotals[degree] || 0;

      return row;
    });

    // Add total row
    const totalRow = { degree: 'Total' };
    let grandTotal = 0;

    hostels.forEach((hostel) => {
      totalRow[hostel.name] = hostelTotals[hostel.name] || 0;
      grandTotal += hostelTotals[hostel.name] || 0;
    });

    totalRow.Total = grandTotal;
    data.push(totalRow);

    // Build column definitions for TanStack Table
    const columns = [
      { accessorKey: 'degree', header: '', category: 'label' },
      ...hostels.map((h) => ({
        accessorKey: h.name,
        header: h.name,
        category: 'hostel',
        hostelId: h._id.toString(),
      })),
      { accessorKey: 'Total', header: 'Total', category: 'total' },
    ];

    return {
      success: true,
      statusCode: 200,
      data: {
        headers,
        columns,
        data,
        grandTotal,
        hostelCount: hostels.length,
        degreeCount: degreeNames.length,
      },
    };
  }
}

export const sheetService = new SheetService();
export default sheetService;
