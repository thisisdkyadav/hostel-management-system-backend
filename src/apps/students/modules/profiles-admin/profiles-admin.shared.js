import { StudentProfile } from '../../../../models/index.js';

export const toObjectIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (value?.toString) return value.toString();
  return null;
};

export const getConstraintContext = (user) => {
  const ownHostelId = toObjectIdString(user?.hostel?._id || user?.hostel);
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
  const missingOptions = StudentProfile.getMissingFieldOptions();

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
