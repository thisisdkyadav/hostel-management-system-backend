import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import { MANAGER_ROLES, SCANNER_ROLES } from "./attendance.constants.js"
import * as controller from "./attendance.controller.js"
import * as validation from "./attendance.validation.js"

const router = express.Router()

router.use(authenticate)

// Super Admin (and any role without a mapped key) falls through — RBAC above is the gate.
const guard = routeGuard(
  {
    [ROLES.ADMIN]: "route.admin.attendance",
    [ROLES.GYMKHANA]: "route.gymkhana.attendance",
  },
  { onUnmapped: "allow" }
)

router.get(
  "/",
  guard(SCANNER_ROLES),
  validate(validation.listQuerySchema, "query"),
  controller.listOccurrences
)

router.post(
  "/",
  guard(MANAGER_ROLES),
  validate(validation.createOccurrenceSchema),
  controller.createOccurrence
)

router.get(
  "/:id",
  guard(SCANNER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  controller.getOccurrence
)

router.patch(
  "/:id",
  guard(MANAGER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.updateOccurrenceSchema),
  controller.updateOccurrence
)

router.delete(
  "/:id",
  guard(MANAGER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  controller.deleteOccurrence
)

router.post(
  "/:id/roster",
  guard(MANAGER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.rosterSchema),
  controller.uploadRoster
)

router.post(
  "/:id/scan",
  guard(SCANNER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.scanSchema),
  controller.scanAttendance
)

router.post(
  "/:id/mark",
  guard(SCANNER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.markSchema),
  controller.markAttendance
)

router.delete(
  "/:id/records/:recordId",
  guard(SCANNER_ROLES),
  validate(validation.recordParamsSchema, "params"),
  controller.deleteRecord
)

export default router
