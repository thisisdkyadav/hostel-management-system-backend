/**
 * @fileoverview Grievance Module Constants
 * @description Constants specific to grievance management
 * @module apps/student-affairs/modules/grievance/constants
 */

// Re-export from app constants for convenience
export {
  GRIEVANCE_STATUS,
  GRIEVANCE_CATEGORY,
  GRIEVANCE_PRIORITY,
  GRIEVANCE_SLA,
  GRIEVANCE_TRANSITIONS,
} from '../../constants/index.js';

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL GRIEVANCE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Grievance response templates
 */
export const GRIEVANCE_TEMPLATES = {
  ACKNOWLEDGEMENT: 'Your grievance has been received and is being reviewed.',
  ASSIGNED: 'Your grievance has been assigned to a staff member for resolution.',
  IN_PROGRESS: 'We are actively working on resolving your grievance.',
  RESOLVED: 'Your grievance has been resolved. Please provide feedback.',
  CLOSED: 'This grievance has been closed.',
  REJECTED: 'After careful review, we are unable to process this grievance.',
};

/**
 * Notification events
 */
export const GRIEVANCE_EVENTS = {
  CREATED: 'grievance.created',
  ASSIGNED: 'grievance.assigned',
  STATUS_CHANGED: 'grievance.status_changed',
  COMMENT_ADDED: 'grievance.comment_added',
  RESOLVED: 'grievance.resolved',
  ESCALATED: 'grievance.escalated',
};
