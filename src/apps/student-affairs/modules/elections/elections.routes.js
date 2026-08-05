import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
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

const guard = routeGuard(
  {
    [ROLES.ADMIN]: "route.admin.elections",
    [ROLES.STUDENT]: "route.student.elections",
    [ROLES.GYMKHANA]: "route.gymkhana.elections",
  },
  { onUnmapped: "allow" }
)

router.get(
  "/admin/selector",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.GYMKHANA]),
  validate(validation.listAdminElectionsSchema, "query"),
  controller.listAdminElections
)

router.get(
  "/student/portal-state",
  guard([ROLES.STUDENT]),
  controller.getStudentPortalState
)

router.get(
  "/student/current",
  guard([ROLES.STUDENT]),
  controller.getStudentCurrentElections
)

router.post(
  "/scope-count",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.scopeCountSchema),
  controller.getScopeCount
)

router.get(
  "/:id/posts/:postId/supporters/lookup",
  guard([ROLES.STUDENT]),
  validate(validation.postIdSchema, "params"),
  validate(validation.supporterLookupQuerySchema, "query"),
  controller.lookupNominationSupporter
)

router.get(
  "/:id",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.GYMKHANA]),
  validate(validation.electionIdSchema, "params"),
  controller.getElectionDetail
)

router.get(
  "/:id/voting-live",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.electionIdSchema, "params"),
  controller.getVotingLiveStats
)

router.get(
  "/:id/voting-emails/recipients",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.electionIdSchema, "params"),
  controller.getVotingEmailRecipients
)

router.get(
  "/:id/test-emails/recipients",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.electionIdSchema, "params"),
  controller.getTestEmailRecipients
)

router.post(
  "/",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.createElectionSchema),
  controller.createElection
)

router.post(
  "/:id/clone",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.electionIdSchema, "params"),
  validate(validation.cloneElectionSchema),
  controller.cloneElection
)

router.put(
  "/:id",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.electionIdSchema, "params"),
  validate(validation.updateElectionSchema),
  controller.updateElection
)

router.post(
  "/:id/posts/:postId/nominations",
  guard([ROLES.STUDENT]),
  validate(validation.postIdSchema, "params"),
  validate(validation.upsertNominationSchema),
  controller.upsertNomination
)

router.post(
  "/:id/nominations/:nominationId/withdraw",
  guard([ROLES.STUDENT]),
  validate(validation.nominationIdSchema, "params"),
  controller.withdrawNomination
)

router.post(
  "/:id/nominations/:nominationId/review",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.nominationIdSchema, "params"),
  validate(validation.reviewNominationSchema),
  controller.reviewNomination
)

router.post(
  "/:id/posts/:postId/vote",
  guard([ROLES.STUDENT]),
  validate(validation.postIdSchema, "params"),
  validate(validation.castVoteSchema),
  controller.castVote
)

router.post(
  "/:id/votes/submit",
  guard([ROLES.STUDENT]),
  validate(validation.electionIdSchema, "params"),
  validate(validation.submitStudentVotesSchema),
  controller.submitStudentVotes
)

router.post(
  "/:id/results/publish",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.electionIdSchema, "params"),
  validate(validation.publishResultsSchema),
  controller.publishResults
)

router.post(
  "/:id/voting-emails/send",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.electionIdSchema, "params"),
  validate(validation.sendVotingEmailsSchema),
  controller.sendVotingEmails
)

router.post(
  "/:id/test-emails/send",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.electionIdSchema, "params"),
  validate(validation.sendTestEmailsSchema),
  controller.sendTestEmails
)

export default router
