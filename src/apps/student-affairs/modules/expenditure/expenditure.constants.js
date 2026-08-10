import { ROLES } from "../../../../core/constants/roles.constants.js"

export const EXPENDITURE_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
}

// Roles that manage expenditure occurrences (create/update/delete + all entries).
export const MANAGER_ROLES = [ROLES.ADMIN, ROLES.SUPER_ADMIN]

// Defensive cap on attachments per entry.
export const MAX_ATTACHMENTS = 20
