import { ROLES } from "../../../../core/constants/roles.constants.js"

export const ATTENDANCE_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
}

export const ATTENDANCE_SOURCE = {
  CAMERA: "camera",
  SCANNER: "scanner",
  MANUAL: "manual",
}

export const SCAN_RESULT = {
  MARKED: "marked",
  DUPLICATE: "duplicate",
}

// Maximum roll numbers accepted in a single roster (CSV) upload.
export const MAX_ROSTER_SIZE = 5000

// Roles an admin can assign to an occurrence to scan attendance.
export const ASSIGNABLE_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.GYMKHANA]

// Roles that manage occurrences (create/update/delete/roster).
export const MANAGER_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN]

// Roles that may scan/mark attendance (subject to per-occurrence access).
export const SCANNER_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.GYMKHANA]
