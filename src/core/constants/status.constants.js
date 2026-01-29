/**
 * Status Constants for various entities
 */

export const COMPLAINT_STATUS = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  CLOSED: "Closed",
}

export const LEAVE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
}

export const VISITOR_STATUS = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CHECKED_IN: "Checked In",
  CHECKED_OUT: "Checked Out",
}

export const TASK_STATUS = {
  PENDING: "pending",
  IN_PROGRESS: "in-progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
}

export const LOST_FOUND_STATUS = {
  LOST: "lost",
  FOUND: "found",
  CLAIMED: "claimed",
  RETURNED: "returned",
}

export const EVENT_STATUS = {
  UPCOMING: "upcoming",
  ONGOING: "ongoing",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
}

export const CHECK_IN_OUT_TYPE = {
  CHECK_IN: "check-in",
  CHECK_OUT: "check-out",
}

export const SCANNER_DIRECTION = {
  IN: "in",
  OUT: "out",
  BOTH: "both",
}

export const SCANNER_TYPE = {
  HOSTEL: "hostel",
  CAMPUS: "campus",
}
