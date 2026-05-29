import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import * as controller from "./por.controller.js"
import * as validation from "./por.validation.js"

const router = express.Router()

router.use(authenticate)

const ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.por",
  [ROLES.GYMKHANA]: "route.gymkhana.por",
  [ROLES.STUDENT]: "route.student.por",
}

const requireMappedRouteAccess = (req, res, next) => {
  const routeKey = ROUTE_KEY_BY_ROLE[req?.user?.role]
  if (!routeKey) return next()
  return requireRouteAccess(routeKey)(req, res, next)
}

router.get(
  "/workspace",
  authorizeRoles([ROLES.STUDENT, ROLES.GYMKHANA, ROLES.ADMIN]),
  requireMappedRouteAccess,
  controller.getWorkspace
)

router.get(
  "/student/:userId",
  authorizeRoles([ROLES.GYMKHANA, ROLES.ADMIN]),
  requireMappedRouteAccess,
  validate(validation.porStudentUserIdSchema, "params"),
  controller.getStudentPorRequests
)

router.post(
  "/",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  validate(validation.createPorRequestSchema),
  controller.createPorRequest
)

router.post(
  "/categories",
  authorizeRoles([ROLES.ADMIN]),
  requireMappedRouteAccess,
  validate(validation.porCategorySchema),
  controller.createPorCategory
)

router.put(
  "/categories/:categoryId",
  authorizeRoles([ROLES.ADMIN]),
  requireMappedRouteAccess,
  validate(validation.porCategoryIdSchema, "params"),
  validate(validation.porCategorySchema),
  controller.updatePorCategory
)

router.put(
  "/:id",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  validate(validation.porRequestIdSchema, "params"),
  validate(validation.createPorRequestSchema),
  controller.updatePorRequest
)

router.post(
  "/:id/approve",
  authorizeRoles([ROLES.GYMKHANA, ROLES.ADMIN]),
  requireMappedRouteAccess,
  validate(validation.porRequestIdSchema, "params"),
  validate(validation.approvalActionSchema),
  controller.approvePorRequest
)

router.post(
  "/:id/reject",
  authorizeRoles([ROLES.GYMKHANA, ROLES.ADMIN]),
  requireMappedRouteAccess,
  validate(validation.porRequestIdSchema, "params"),
  validate(validation.rejectionSchema),
  controller.rejectPorRequest
)

router.post(
  "/:id/revision",
  authorizeRoles([ROLES.GYMKHANA, ROLES.ADMIN]),
  requireMappedRouteAccess,
  validate(validation.porRequestIdSchema, "params"),
  validate(validation.revisionSchema),
  controller.requestPorRevision
)

router.get(
  "/:id/history",
  authorizeRoles([ROLES.STUDENT, ROLES.GYMKHANA, ROLES.ADMIN]),
  requireMappedRouteAccess,
  validate(validation.porRequestIdSchema, "params"),
  controller.getApprovalHistory
)

export default router
