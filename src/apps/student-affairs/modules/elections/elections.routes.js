import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import * as controller from "./elections.controller.js"
import * as validation from "./elections.validation.js"

const router = express.Router()
router.use(authenticate)

const ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.elections",
  [ROLES.STUDENT]: "route.student.elections",
}

const requireMappedRouteAccess = (req, res, next) => {
  const routeKey = ROUTE_KEY_BY_ROLE[req?.user?.role]
  if (!routeKey) return next()
  return requireRouteAccess(routeKey)(req, res, next)
}

router.get(
  "/admin/selector",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.listAdminElectionsSchema, "query"),
  controller.listAdminElections
)

router.get(
  "/student/portal-state",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  controller.getStudentPortalState
)

router.get(
  "/student/current",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  controller.getStudentCurrentElections
)

router.get(
  "/:id",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  controller.getElectionDetail
)

router.post(
  "/",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.createElectionSchema),
  controller.createElection
)

router.put(
  "/:id",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  validate(validation.updateElectionSchema),
  controller.updateElection
)

router.post(
  "/:id/posts/:postId/nominations",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  validate(validation.postIdSchema, "params"),
  validate(validation.upsertNominationSchema),
  controller.upsertNomination
)

router.post(
  "/:id/nominations/:nominationId/withdraw",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  validate(validation.nominationIdSchema, "params"),
  controller.withdrawNomination
)

router.post(
  "/:id/nominations/:nominationId/review",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.nominationIdSchema, "params"),
  validate(validation.reviewNominationSchema),
  controller.reviewNomination
)

router.post(
  "/:id/posts/:postId/vote",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  validate(validation.postIdSchema, "params"),
  validate(validation.castVoteSchema),
  controller.castVote
)

router.post(
  "/:id/results/publish",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  validate(validation.publishResultsSchema),
  controller.publishResults
)

export default router
