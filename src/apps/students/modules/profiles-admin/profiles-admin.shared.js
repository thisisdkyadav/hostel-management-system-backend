import { ROLES } from '../../../../core/constants/roles.constants.js';
import { studentProfileQueries } from '../../../../services/student/studentProfileQueries.service.js';

// Roles whose reach must be limited to their active hostel. A hostel-bound
// staff member with no resolvable hostel fails CLOSED (empty scope) instead of
// reading system-wide.
const HOSTEL_BOUND_ROLES = new Set([ROLES.WARDEN, ROLES.ASSOCIATE_WARDEN, ROLES.HOSTEL_SUPERVISOR]);

export const toObjectIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (value?.toString) return value.toString();
  return null;
};

export const getConstraintContext = (user) => {
  const ownHostelId = toObjectIdString(user?.hostel?._id || user?.hostel);
  // Fail closed: hostel-bound staff without an active hostel see nothing.
  if (HOSTEL_BOUND_ROLES.has(user?.role) && !ownHostelId) {
    return { scopedHostelIds: new Set() };
  }
  const scopedHostelIds = ownHostelId ? new Set([ownHostelId]) : null;

  return {
    scopedHostelIds,
  };
};

export const isHostelAllowed = (hostelId, context) => {
  const scopedHostelIds = context?.scopedHostelIds;
  if (!scopedHostelIds) return true;
  if (!hostelId) return false;
  return scopedHostelIds.has(toObjectIdString(hostelId));
};

export const buildEmptyStudentsResult = (searchQuery = {}) => {
  const page = parseInt(searchQuery.page, 10) || 1;
  const limit = parseInt(searchQuery.limit, 10) || 10;
  const missingOptions = studentProfileQueries.getMissingFieldOptions();

  return {
    success: true,
    statusCode: 200,
    data: {
      students: [],
      pagination: {
        total: 0,
        page,
        limit,
        pages: 0,
      },
      meta: { missingOptions },
    },
    message: 'Students fetched successfully',
  };
};

export default {
  toObjectIdString,
  getConstraintContext,
  isHostelAllowed,
  buildEmptyStudentsResult,
};
