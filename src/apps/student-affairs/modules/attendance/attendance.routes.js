import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import { MANAGER_ROLES, SCANNER_ROLES } from "./attendance.constants.js"
import * as controller from "./attendance.controller.js"
import * as validation from "./attendance.validation.js"

const router = express.Router()

router.use(authenticate)

const ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.attendance",
  [ROLES.GYMKHANA]: "route.gymkhana.attendance",
}

// Super Admin (and any role without a mapped key) falls through — RBAC above is the gate.
const requireMappedRouteAccess = (req, res, next) => {
  const routeKey = ROUTE_KEY_BY_ROLE[req?.user?.role]
  if (!routeKey) return next()
  return requireRouteAccess(routeKey)(req, res, next)
}

router.get(
  "/",
  authorizeRoles(SCANNER_ROLES),
  requireMappedRouteAccess,
  validate(validation.listQuerySchema, "query"),
  controller.listOccurrences
)

router.post(
  "/",
  authorizeRoles(MANAGER_ROLES),
  requireMappedRouteAccess,
  validate(validation.createOccurrenceSchema),
  controller.createOccurrence
)

router.get(
  "/:id",
  authorizeRoles(SCANNER_ROLES),
  requireMappedRouteAccess,
  validate(validation.occurrenceIdSchema, "params"),
  controller.getOccurrence
)

router.patch(
  "/:id",
  authorizeRoles(MANAGER_ROLES),
  requireMappedRouteAccess,
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.updateOccurrenceSchema),
  controller.updateOccurrence
)

router.delete(
  "/:id",
  authorizeRoles(MANAGER_ROLES),
  requireMappedRouteAccess,
  validate(validation.occurrenceIdSchema, "params"),
  controller.deleteOccurrence
)

router.post(
  "/:id/roster",
  authorizeRoles(MANAGER_ROLES),
  requireMappedRouteAccess,
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.rosterSchema),
  controller.uploadRoster
)

router.post(
  "/:id/scan",
  authorizeRoles(SCANNER_ROLES),
  requireMappedRouteAccess,
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.scanSchema),
  controller.scanAttendance
)

router.post(
  "/:id/mark",
  authorizeRoles(SCANNER_ROLES),
  requireMappedRouteAccess,
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.markSchema),
  controller.markAttendance
)

router.delete(
  "/:id/records/:recordId",
  authorizeRoles(SCANNER_ROLES),
  requireMappedRouteAccess,
  validate(validation.recordParamsSchema, "params"),
  controller.deleteRecord
)

export default router
