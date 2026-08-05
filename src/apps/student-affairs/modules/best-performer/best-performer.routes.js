import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import * as controller from "./best-performer.controller.js"
import * as validation from "./best-performer.validation.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"

const router = express.Router()
router.use(authenticate)

const guard = routeGuard(
  {
    [ROLES.ADMIN]: "route.admin.overallBestPerformer",
    [ROLES.ACADEMICS]: "route.academics.bestPerformer",
    [ROLES.STUDENT]: "route.student.overallBestPerformer",
  },
  { onUnmapped: "allow" }
)

router.get(
  "/occurrences/selector",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ACADEMICS]),
  controller.getOccurrenceSelector
)

router.get(
  "/occurrences/:id",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.ACADEMICS]),
  validate(validation.occurrenceIdSchema, "params"),
  controller.getOccurrenceDetail
)

router.post(
  "/occurrences",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.createOccurrenceSchema),
  controller.createOccurrence
)

router.put(
  "/occurrences/:id",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.updateOccurrenceSchema),
  controller.updateOccurrence
)

router.get(
  "/student/portal-state",
  guard([ROLES.STUDENT]),
  controller.getStudentPortalState
)

router.post(
  "/occurrences/:id/application",
  guard([ROLES.STUDENT]),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.upsertApplicationSchema),
  controller.upsertStudentApplication
)

router.post(
  "/applications/:id/review",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.applicationIdSchema, "params"),
  validate(validation.reviewApplicationSchema),
  controller.reviewApplication
)

router.patch(
  "/applications/:id/item-type",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.applicationIdSchema, "params"),
  validate(validation.updateApplicationItemTypeSchema),
  controller.updateApplicationItemType
)

router.patch(
  "/applications/:id/coursework-score",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.applicationIdSchema, "params"),
  validate(validation.updateApplicationCourseworkScoreSchema),
  controller.updateApplicationCourseworkScore
)

router.patch(
  "/applications/:id/project-thesis-grades",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.applicationIdSchema, "params"),
  validate(validation.updateApplicationProjectThesisGradesSchema),
  controller.updateApplicationProjectThesisGrades
)

router.post(
  "/applications/:id/hod-verification",
  guard([ROLES.ACADEMICS]),
  validate(validation.applicationIdSchema, "params"),
  validate(validation.hodVerificationSchema),
  controller.addHodVerification
)

export default router
