/**
 * Base Services Module
 * Central exports for all base service utilities
 * 
 * @module services/base
 * 
 * @example
 * // Import everything
 * import { BaseService, ServiceResponse, query, PRESETS, withTransaction, logger } from '../base/index.js';
 * 
 * // Or import specific items
 * import BaseService from '../base/BaseService.js';
 * import { success, notFound, error } from '../base/ServiceResponse.js';
 */

// Core BaseService class
export { BaseService, default } from './BaseService.js';

// Response helpers
export {
  ServiceResponse,
  success,
  created,
  error,
  notFound,
  badRequest,
  unauthorized,
  forbidden,
  conflict,
  paginated
} from './ServiceResponse.js';

// Transaction helper
export { withTransaction, withTransactionResponse } from './TransactionHelper.js';

// Query builder
export { QueryBuilder, query } from './QueryBuilder.js';

// Populate presets
export {
  // User populates
  USER_BASIC,
  USER_WITH_PHONE,
  USER_WITH_IMAGE,
  USER_FULL,
  // Staff populates
  STAFF_BASIC,
  STAFF_WITH_IMAGE,
  ASSIGNED_TO,
  RESOLVED_BY,
  CREATED_BY,
  APPROVAL_BY,
  // Hostel populates
  HOSTEL_BASIC,
  HOSTEL_FULL,
  // Room populates
  ROOM_BASIC,
  ROOM_FULL,
  // Unit populates
  UNIT_BASIC,
  UNIT_FULL,
  // Compound presets
  PRESETS,
  buildPopulate,
  populate
} from './PopulatePresets.js';

// Logger
export { logger } from './Logger.js';
