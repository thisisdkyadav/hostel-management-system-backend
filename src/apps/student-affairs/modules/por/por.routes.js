import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import * as controller from "./por.controller.js"
import * as validation from "./por.validation.js"

const router = express.Router()

router.use(authenticate)

const guard = routeGuard(
  {
    [ROLES.ADMIN]: "route.admin.por",
    [ROLES.GYMKHANA]: "route.gymkhana.por",
    [ROLES.STUDENT]: "route.student.por",
  },
  { onUnmapped: "allow" }
)

router.get(
  "/workspace",
  guard([ROLES.STUDENT, ROLES.GYMKHANA, ROLES.ADMIN]),
  controller.getWorkspace
)

router.get(
  "/student/:userId",
  guard([ROLES.GYMKHANA, ROLES.ADMIN]),
  validate(validation.porStudentUserIdSchema, "params"),
  controller.getStudentPorRequests
)

router.post(
  "/",
  guard([ROLES.STUDENT]),
  validate(validation.createPorRequestSchema),
  controller.createPorRequest
)

router.post(
  "/categories",
  guard([ROLES.ADMIN]),
  validate(validation.porCategorySchema),
  controller.createPorCategory
)

router.put(
  "/categories/:categoryId",
  guard([ROLES.ADMIN]),
  validate(validation.porCategoryIdSchema, "params"),
  validate(validation.porCategorySchema),
  controller.updatePorCategory
)

router.put(
  "/:id",
  guard([ROLES.STUDENT]),
  validate(validation.porRequestIdSchema, "params"),
  validate(validation.createPorRequestSchema),
  controller.updatePorRequest
)

router.post(
  "/:id/approve",
  guard([ROLES.GYMKHANA, ROLES.ADMIN]),
  validate(validation.porRequestIdSchema, "params"),
  validate(validation.approvalActionSchema),
  controller.approvePorRequest
)

router.post(
  "/:id/reject",
  guard([ROLES.GYMKHANA, ROLES.ADMIN]),
  validate(validation.porRequestIdSchema, "params"),
  validate(validation.rejectionSchema),
  controller.rejectPorRequest
)

router.post(
  "/:id/revision",
  guard([ROLES.GYMKHANA, ROLES.ADMIN]),
  validate(validation.porRequestIdSchema, "params"),
  validate(validation.revisionSchema),
  controller.requestPorRevision
)

router.get(
  "/:id/history",
  guard([ROLES.STUDENT, ROLES.GYMKHANA, ROLES.ADMIN]),
  validate(validation.porRequestIdSchema, "params"),
  controller.getApprovalHistory
)

router.get(
  "/:id/certificate",
  guard([ROLES.STUDENT, ROLES.GYMKHANA, ROLES.ADMIN]),
  validate(validation.porRequestIdSchema, "params"),
  controller.getPorCertificateData
)

export default router
