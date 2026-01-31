/**
 * @fileoverview Student Affairs App Constants
 * @description App-wide constants for Student Affairs module
 * @module apps/student-affairs/constants
 */

// ═══════════════════════════════════════════════════════════════════════════════
// ROLES SPECIFIC TO STUDENT AFFAIRS
// ═══════════════════════════════════════════════════════════════════════════════

export const SA_ROLES = {
  DEAN: 'Dean Student Affairs',
  STAFF: 'Student Affairs Staff',
  COUNSELOR: 'Counselor',
  COMMITTEE_MEMBER: 'Committee Member',
};

/**
 * Role groups for Student Affairs app
 */
export const SA_ROLE_GROUPS = {
  // All Student Affairs staff
  ALL_STAFF: [SA_ROLES.DEAN, SA_ROLES.STAFF, SA_ROLES.COUNSELOR, SA_ROLES.COMMITTEE_MEMBER],

  // Admin level
  ADMINS: [SA_ROLES.DEAN, 'Admin', 'Super Admin'],

  // Can handle grievances
  GRIEVANCE_HANDLERS: [SA_ROLES.DEAN, SA_ROLES.STAFF, 'Admin', 'Super Admin'],

  // Can approve scholarships
  SCHOLARSHIP_APPROVERS: [SA_ROLES.DEAN, 'Admin', 'Super Admin'],

  // Counseling access
  COUNSELING_STAFF: [SA_ROLES.COUNSELOR, SA_ROLES.DEAN, 'Admin', 'Super Admin'],

  // Disciplinary committee
  DISCIPLINARY_COMMITTEE: [SA_ROLES.DEAN, SA_ROLES.COMMITTEE_MEMBER, 'Admin', 'Super Admin'],
};

// ═══════════════════════════════════════════════════════════════════════════════
// GRIEVANCE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const GRIEVANCE_STATUS = {
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  REJECTED: 'rejected',
  ESCALATED: 'escalated',
};

export const GRIEVANCE_CATEGORY = {
  ACADEMIC: 'academic',
  ADMINISTRATIVE: 'administrative',
  INFRASTRUCTURE: 'infrastructure',
  HARASSMENT: 'harassment',
  DISCRIMINATION: 'discrimination',
  FINANCIAL: 'financial',
  HOSTEL: 'hostel',
  OTHER: 'other',
};

export const GRIEVANCE_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
  CRITICAL: 'critical',
};

/**
 * SLA (Service Level Agreement) in days
 */
export const GRIEVANCE_SLA = {
  [GRIEVANCE_PRIORITY.LOW]: 14,
  [GRIEVANCE_PRIORITY.MEDIUM]: 7,
  [GRIEVANCE_PRIORITY.HIGH]: 3,
  [GRIEVANCE_PRIORITY.URGENT]: 1,
  [GRIEVANCE_PRIORITY.CRITICAL]: 0.5, // 12 hours
};

/**
 * Valid status transitions
 */
export const GRIEVANCE_TRANSITIONS = {
  [GRIEVANCE_STATUS.PENDING]: [
    GRIEVANCE_STATUS.UNDER_REVIEW,
    GRIEVANCE_STATUS.REJECTED,
  ],
  [GRIEVANCE_STATUS.UNDER_REVIEW]: [
    GRIEVANCE_STATUS.IN_PROGRESS,
    GRIEVANCE_STATUS.ESCALATED,
    GRIEVANCE_STATUS.REJECTED,
  ],
  [GRIEVANCE_STATUS.IN_PROGRESS]: [
    GRIEVANCE_STATUS.RESOLVED,
    GRIEVANCE_STATUS.ESCALATED,
    GRIEVANCE_STATUS.UNDER_REVIEW,
  ],
  [GRIEVANCE_STATUS.ESCALATED]: [
    GRIEVANCE_STATUS.IN_PROGRESS,
    GRIEVANCE_STATUS.RESOLVED,
  ],
  [GRIEVANCE_STATUS.RESOLVED]: [
    GRIEVANCE_STATUS.CLOSED,
    GRIEVANCE_STATUS.IN_PROGRESS, // Reopened
  ],
  [GRIEVANCE_STATUS.REJECTED]: [],
  [GRIEVANCE_STATUS.CLOSED]: [],
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCHOLARSHIP CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const SCHOLARSHIP_STATUS = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  DISBURSED: 'disbursed',
  REVOKED: 'revoked',
};

export const SCHOLARSHIP_TYPE = {
  MERIT: 'merit',
  NEED_BASED: 'need_based',
  SPORTS: 'sports',
  CULTURAL: 'cultural',
  RESEARCH: 'research',
  GOVERNMENT: 'government',
  PRIVATE: 'private',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COUNSELING CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const COUNSELING_STATUS = {
  REQUESTED: 'requested',
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
  RESCHEDULED: 'rescheduled',
};

export const COUNSELING_TYPE = {
  ACADEMIC: 'academic',
  CAREER: 'career',
  PERSONAL: 'personal',
  MENTAL_HEALTH: 'mental_health',
  CRISIS: 'crisis',
  GROUP: 'group',
};

export const COUNSELING_MODE = {
  IN_PERSON: 'in_person',
  ONLINE: 'online',
  PHONE: 'phone',
};

// ═══════════════════════════════════════════════════════════════════════════════
// DISCIPLINARY CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const DISCIPLINARY_STATUS = {
  REPORTED: 'reported',
  UNDER_INVESTIGATION: 'under_investigation',
  HEARING_SCHEDULED: 'hearing_scheduled',
  DECISION_PENDING: 'decision_pending',
  ACTION_TAKEN: 'action_taken',
  APPEALED: 'appealed',
  CLOSED: 'closed',
};

export const DISCIPLINARY_SEVERITY = {
  MINOR: 'minor',
  MODERATE: 'moderate',
  SEVERE: 'severe',
  CRITICAL: 'critical',
};

export const DISCIPLINARY_ACTION = {
  WARNING: 'warning',
  FINE: 'fine',
  COMMUNITY_SERVICE: 'community_service',
  SUSPENSION: 'suspension',
  EXPULSION: 'expulsion',
  PROBATION: 'probation',
};

// ═══════════════════════════════════════════════════════════════════════════════
// CLUB CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const CLUB_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING_APPROVAL: 'pending_approval',
};

export const CLUB_CATEGORY = {
  TECHNICAL: 'technical',
  CULTURAL: 'cultural',
  SPORTS: 'sports',
  LITERARY: 'literary',
  SOCIAL_SERVICE: 'social_service',
  ENTREPRENEURSHIP: 'entrepreneurship',
  OTHER: 'other',
};

export const CLUB_MEMBER_ROLE = {
  PRESIDENT: 'president',
  VICE_PRESIDENT: 'vice_president',
  SECRETARY: 'secretary',
  TREASURER: 'treasurer',
  MEMBER: 'member',
  ADVISOR: 'advisor',
};

// ═══════════════════════════════════════════════════════════════════════════════
// ELECTION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

export const ELECTION_STATUS = {
  UPCOMING: 'upcoming',
  NOMINATION_OPEN: 'nomination_open',
  NOMINATION_CLOSED: 'nomination_closed',
  VOTING_OPEN: 'voting_open',
  VOTING_CLOSED: 'voting_closed',
  RESULTS_DECLARED: 'results_declared',
  CANCELLED: 'cancelled',
};

export const ELECTION_POSITION = {
  PRESIDENT: 'president',
  VICE_PRESIDENT: 'vice_president',
  GENERAL_SECRETARY: 'general_secretary',
  CULTURAL_SECRETARY: 'cultural_secretary',
  SPORTS_SECRETARY: 'sports_secretary',
  TECHNICAL_SECRETARY: 'technical_secretary',
  CLASS_REPRESENTATIVE: 'class_representative',
};
