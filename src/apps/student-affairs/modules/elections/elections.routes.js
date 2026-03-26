import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import * as controller from "./elections.controller.js"
import * as validation from "./elections.validation.js"

const router = express.Router()

router.get(
  "/supporter-confirmation/:token",
  validate(validation.supporterConfirmationTokenSchema, "params"),
  controller.getSupporterConfirmationByToken
)

router.post(
  "/supporter-confirmation/:token/respond",
  validate(validation.supporterConfirmationTokenSchema, "params"),
  validate(validation.supporterConfirmationResponseSchema),
  controller.respondToSupporterConfirmation
)

router.get(
  "/ballot/:token",
  validate(validation.ballotTokenSchema, "params"),
  controller.getBallotByToken
)

router.post(
  "/ballot/:token/submit",
  validate(validation.ballotTokenSchema, "params"),
  validate(validation.submitBallotSchema),
  controller.submitBallotByToken
)

router.use(authenticate)

const ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.elections",
  [ROLES.STUDENT]: "route.student.elections",
  [ROLES.GYMKHANA]: "route.gymkhana.elections",
}

const requireMappedRouteAccess = (req, res, next) => {
  const routeKey = ROUTE_KEY_BY_ROLE[req?.user?.role]
  if (!routeKey) return next()
  return requireRouteAccess(routeKey)(req, res, next)
}

router.get(
  "/admin/selector",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.GYMKHANA]),
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

router.post(
  "/scope-count",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.scopeCountSchema),
  controller.getScopeCount
)

router.get(
  "/:id/posts/:postId/supporters/lookup",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  validate(validation.postIdSchema, "params"),
  validate(validation.supporterLookupQuerySchema, "query"),
  controller.lookupNominationSupporter
)

router.get(
  "/:id",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.GYMKHANA]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  controller.getElectionDetail
)

router.get(
  "/:id/voting-live",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  controller.getVotingLiveStats
)

router.get(
  "/:id/voting-emails/recipients",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  controller.getVotingEmailRecipients
)

router.post(
  "/",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.createElectionSchema),
  controller.createElection
)

router.post(
  "/:id/clone",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  validate(validation.cloneElectionSchema),
  controller.cloneElection
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
  "/:id/votes/submit",
  authorizeRoles([ROLES.STUDENT]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  validate(validation.submitStudentVotesSchema),
  controller.submitStudentVotes
)

router.post(
  "/:id/results/publish",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  validate(validation.publishResultsSchema),
  controller.publishResults
)

router.post(
  "/:id/voting-emails/send",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.electionIdSchema, "params"),
  validate(validation.sendVotingEmailsSchema),
  controller.sendVotingEmails
)

export default router
