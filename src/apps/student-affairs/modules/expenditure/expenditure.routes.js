import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"
import { MANAGER_ROLES } from "./expenditure.constants.js"
import * as controller from "./expenditure.controller.js"
import * as validation from "./expenditure.validation.js"

const router = express.Router()

router.use(authenticate)

// Admin manages expenditure. Super Admin (unmapped) falls through — RBAC above is the gate.
const guard = routeGuard(
  { [ROLES.ADMIN]: "route.admin.expenditure" },
  { onUnmapped: "allow" }
)

// ---- Occurrences ----
router.get("/", guard(MANAGER_ROLES), validate(validation.listQuerySchema, "query"), controller.listOccurrences)
router.post("/", guard(MANAGER_ROLES), validate(validation.createOccurrenceSchema), controller.createOccurrence)
router.get("/:id", guard(MANAGER_ROLES), validate(validation.occurrenceIdSchema, "params"), controller.getOccurrence)
router.patch(
  "/:id",
  guard(MANAGER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.updateOccurrenceSchema),
  controller.updateOccurrence
)
router.delete("/:id", guard(MANAGER_ROLES), validate(validation.occurrenceIdSchema, "params"), controller.deleteOccurrence)

// ---- Expenses ----
router.post(
  "/:id/expenses",
  guard(MANAGER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.createExpenseSchema),
  controller.addExpense
)
router.patch(
  "/:id/expenses/:expenseId",
  guard(MANAGER_ROLES),
  validate(validation.expenseParamsSchema, "params"),
  validate(validation.updateExpenseSchema),
  controller.updateExpense
)
router.delete(
  "/:id/expenses/:expenseId",
  guard(MANAGER_ROLES),
  validate(validation.expenseParamsSchema, "params"),
  controller.deleteExpense
)

// ---- Bills (nested under an expense) ----
router.post(
  "/:id/expenses/:expenseId/bills",
  guard(MANAGER_ROLES),
  validate(validation.expenseParamsSchema, "params"),
  validate(validation.createBillSchema),
  controller.addBill
)
router.patch(
  "/:id/expenses/:expenseId/bills/:billId",
  guard(MANAGER_ROLES),
  validate(validation.billParamsSchema, "params"),
  validate(validation.updateBillSchema),
  controller.updateBill
)
router.delete(
  "/:id/expenses/:expenseId/bills/:billId",
  guard(MANAGER_ROLES),
  validate(validation.billParamsSchema, "params"),
  controller.deleteBill
)

// ---- Payments ----
router.post(
  "/:id/payments",
  guard(MANAGER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.createPaymentSchema),
  controller.addPayment
)
router.patch(
  "/:id/payments/:paymentId",
  guard(MANAGER_ROLES),
  validate(validation.paymentParamsSchema, "params"),
  validate(validation.updatePaymentSchema),
  controller.updatePayment
)
router.delete(
  "/:id/payments/:paymentId",
  guard(MANAGER_ROLES),
  validate(validation.paymentParamsSchema, "params"),
  controller.deletePayment
)

// ---- Occurrence-level documents ----
router.post(
  "/:id/documents",
  guard(MANAGER_ROLES),
  validate(validation.occurrenceIdSchema, "params"),
  validate(validation.addDocumentsSchema),
  controller.addDocuments
)
router.delete(
  "/:id/documents/:documentId",
  guard(MANAGER_ROLES),
  validate(validation.documentParamsSchema, "params"),
  controller.deleteDocument
)

export default router
