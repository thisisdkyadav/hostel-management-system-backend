import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import * as controller from "./best-performer.controller.js"
import * as validation from "./best-performer.validation.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"

const router = express.Router()
router.use(authenticate)

const ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.overallBestPerformer",
  [ROLES.STUDENT]: "route.student.overallBestPerformer",
}

const requireMappedRouteAccess = (req, res, next) => {
  const routeKey = ROUTE_KEY_BY_ROLE[req?.user?.role]
  if (!routeKey) return next()
  return requireRouteAccess(routeKey)(req, res, next)
}

router.get(
  "/occurrences/selector",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  controller.getOccurrenceSelector
)

router.get(
  "/occurrences/:id",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.occurrenceIdSchema, "params"),
  controller.getOccurrenceDetail
)

router.post(
  "/occurrences",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.createOccurrenceSchema),
  controller.createOccurrence
)

router.put(
  "/occurrences/:id",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.updateOccurrenceSchema),
  controller.updateOccurrence
)

router.get(
  "/student/portal-state",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  controller.getStudentPortalState
)

router.post(
  "/occurrences/:id/application",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.upsertApplicationSchema),
  controller.upsertStudentApplication
)

router.post(
  "/applications/:id/review",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.applicationIdSchema, "params"),
  validate(validation.reviewApplicationSchema),
  controller.reviewApplication
)

export default router
