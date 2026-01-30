/**
 * Populate Presets
 * Standardized populate configurations to prevent duplication
 * 
 * @module services/base/PopulatePresets
 */

// ==================== User Populates ====================

export const USER_BASIC = { path: 'userId', select: 'name email' };
export const USER_WITH_PHONE = { path: 'userId', select: 'name email phone' };
export const USER_WITH_IMAGE = { path: 'userId', select: 'name email profileImage' };
export const USER_FULL = { path: 'userId', select: 'name email phone profileImage role' };

// ==================== Staff Populates ====================

export const STAFF_BASIC = { select: 'name email phone' };
export const STAFF_WITH_IMAGE = { select: 'name email phone profileImage' };

// For fields like assignedTo, resolvedBy, createdBy
export const ASSIGNED_TO = { path: 'assignedTo', select: 'name email phone profileImage' };
export const RESOLVED_BY = { path: 'resolvedBy', select: 'name email phone profileImage' };
export const CREATED_BY = { path: 'createdBy', select: 'name email' };
export const APPROVAL_BY = { path: 'approvalBy', select: 'name email' };

// ==================== Hostel Populates ====================

export const HOSTEL_BASIC = { path: 'hostelId', select: 'name' };
export const HOSTEL_FULL = { path: 'hostelId', select: 'name gender type' };

// ==================== Room Populates ====================

export const ROOM_BASIC = { path: 'roomId', select: 'roomNumber' };
export const ROOM_FULL = { path: 'roomId', select: 'roomNumber capacity status occupancy' };

// ==================== Unit Populates ====================

export const UNIT_BASIC = { path: 'unitId', select: 'unitNumber' };
export const UNIT_FULL = { path: 'unitId', select: 'unitNumber floor' };

// ==================== Compound Presets ====================

export const PRESETS = {
  // Complaint with all relations
  COMPLAINT: [
    { path: 'userId', select: 'name email profileImage phone role' },
    { path: 'hostelId', select: 'name' },
    { path: 'roomId', select: 'roomNumber' },
    { path: 'unitId', select: 'unitNumber' },
    { path: 'assignedTo', select: 'name email phone profileImage' },
    { path: 'resolvedBy', select: 'name email phone profileImage' }
  ],

  // Visitor request
  VISITOR_REQUEST: [
    { path: 'userId', select: 'name email profileImage' },
    { path: 'visitors' },
    { path: 'hostelId', select: 'name' }
  ],

  // Leave with user
  LEAVE: [
    { path: 'userId', select: 'name email' },
    { path: 'approvalBy', select: 'name email' }
  ],

  // Room allocation
  ROOM_ALLOCATION: [
    { path: 'userId', select: 'name email' },
    { path: 'hostelId', select: 'name' },
    { path: 'roomId', select: 'roomNumber capacity' },
    { path: 'unitId', select: 'unitNumber' }
  ],

  // Feedback
  FEEDBACK: [
    { path: 'userId', select: 'name email profileImage' },
    { path: 'hostelId', select: 'name' }
  ],

  // Task
  TASK: [
    { path: 'assignedTo', select: 'name email phone' },
    { path: 'createdBy', select: 'name email' },
    { path: 'hostelId', select: 'name' }
  ],

  // Security/Warden/Staff
  STAFF_WITH_HOSTEL: [
    { path: 'userId', select: 'name email phone profileImage' },
    { path: 'hostelId', select: 'name' }
  ],

  // Certificate
  CERTIFICATE: [
    { path: 'userId', select: 'name email' }
  ],

  // Event
  EVENT: [
    { path: 'hostelId', select: 'name' }
  ]
};

/**
 * Helper to build populate array from preset names
 * @param  {...string} presetNames - Names from PRESETS
 * @returns {Array} Combined populate array
 */
export function buildPopulate(...presetNames) {
  return presetNames.flatMap(name => PRESETS[name] || []);
}

/**
 * Helper to create a custom populate config
 * @param {string} path - Field path
 * @param {string} select - Fields to select
 * @returns {Object} Populate config
 */
export function populate(path, select) {
  return { path, select };
}

export default PRESETS;
