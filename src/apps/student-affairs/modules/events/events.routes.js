/**
 * @fileoverview Events Routes
 * @description Route definitions for events management
 */

import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import * as eventsController from "./events.controller.js"
import * as validation from "./events.validation.js"
import { ROLES, ROLE_GROUPS } from "../../../../core/constants/roles.constants.js"

const router = express.Router()
router.use(authenticate)

const EVENTS_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.gymkhanaEvents",
  [ROLES.GYMKHANA]: "route.gymkhana.events",
}

const MEGA_EVENTS_ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.megaEvents",
  [ROLES.GYMKHANA]: "route.gymkhana.megaEvents",
}

const requireRoleMappedRouteAccess = (routeKeyByRole) => (req, res, next) => {
  const routeKey = routeKeyByRole[req?.user?.role]
  if (!routeKey) {
    return next()
  }
  return requireRouteAccess(routeKey)(req, res, next)
}

const requireEventsRouteAccess = requireRoleMappedRouteAccess(EVENTS_ROUTE_KEY_BY_ROLE)
const requireMegaEventsRouteAccess = requireRoleMappedRouteAccess(MEGA_EVENTS_ROUTE_KEY_BY_ROLE)
const requireGymkhanaDashboardRouteAccess = requireRouteAccess("route.gymkhana.dashboard")

const eventsViewAccess = [requireEventsRouteAccess]
const eventsCreateAccess = [requireEventsRouteAccess]
const eventsApproveAccess = [requireEventsRouteAccess]
const megaEventsViewAccess = [requireMegaEventsRouteAccess]
const megaEventsCreateAccess = [requireMegaEventsRouteAccess]

// Get all calendars
router.get(
  "/calendar",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  validate(validation.calendarQuerySchema, "query"),
  eventsController.getCalendars
)

// Get calendar by year
router.get(
  "/calendar/year/:year",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getCalendarByYear
)

// Get all academic years (for dropdown) - must be before :id route
router.get(
  "/calendar/years",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getAcademicYears
)

// Get calendar by ID
router.get(
  "/calendar/:id",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getCalendarById
)

// Update calendar (Gymkhana role; GS/President restrictions enforced in service)
router.put(
  "/calendar/:id",
  authorizeRoles([ROLES.GYMKHANA]),
  ...eventsCreateAccess,
  validate(validation.updateCalendarSchema),
  eventsController.updateCalendar
)

// Submit calendar for approval (President only; enforced in service)
router.post(
  "/calendar/:id/submit",
  authorizeRoles([ROLES.GYMKHANA]),
  ...eventsCreateAccess,
  validate(validation.submitCalendarSchema),
  eventsController.submitCalendar
)

// Check date overlap for a candidate event in this calendar
router.post(
  "/calendar/:id/check-overlap",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsCreateAccess,
  validate(validation.checkOverlapSchema),
  eventsController.checkCalendarOverlap
)

// Approve calendar
router.post(
  "/calendar/:id/approve",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsApproveAccess,
  validate(validation.approvalActionSchema),
  eventsController.approveCalendar
)

// Reject calendar
router.post(
  "/calendar/:id/reject",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsApproveAccess,
  validate(validation.rejectionSchema),
  eventsController.rejectCalendar
)

// Get calendar approval history
router.get(
  "/calendar/:id/history",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getCalendarHistory
)

// Lock calendar (Admin only)
router.post(
  "/calendar/:id/lock",
  authorizeRoles(ROLE_GROUPS.ADMIN_LEVEL),
  ...eventsApproveAccess,
  eventsController.lockCalendar
)

// Unlock calendar (Admin only)
router.post(
  "/calendar/:id/unlock",
  authorizeRoles(ROLE_GROUPS.ADMIN_LEVEL),
  ...eventsApproveAccess,
  eventsController.unlockCalendar
)


// ═══════════════════════════════════════════════════════════════════════════════
// AMENDMENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Request amendment (GS only)
router.post(
  "/amendments",
  authorizeRoles([ROLES.GYMKHANA]),
  ...eventsCreateAccess,
  validate(validation.createAmendmentSchema),
  eventsController.createAmendment
)

// Get pending amendments (Admin only)
router.get(
  "/amendments",
  authorizeRoles(ROLE_GROUPS.ADMIN_LEVEL),
  ...eventsApproveAccess,
  eventsController.getPendingAmendments
)

// Approve amendment (Admin only)
router.post(
  "/amendments/:id/approve",
  authorizeRoles(ROLE_GROUPS.ADMIN_LEVEL),
  ...eventsApproveAccess,
  validate(validation.reviewAmendmentSchema),
  eventsController.approveAmendment
)

// Reject amendment (Admin only)
router.post(
  "/amendments/:id/reject",
  authorizeRoles(ROLE_GROUPS.ADMIN_LEVEL),
  ...eventsApproveAccess,
  validate(validation.reviewAmendmentSchema),
  eventsController.rejectAmendment
)

// ═══════════════════════════════════════════════════════════════════════════════
// MEGA EVENTS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  "/mega-series",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...megaEventsViewAccess,
  eventsController.getMegaSeries
)

router.post(
  "/mega-series",
  authorizeRoles(ROLE_GROUPS.ADMIN_LEVEL),
  ...megaEventsCreateAccess,
  validate(validation.createMegaSeriesSchema),
  eventsController.createMegaSeries
)

router.get(
  "/mega-series/:seriesId",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...megaEventsViewAccess,
  validate(validation.megaSeriesIdSchema, "params"),
  eventsController.getMegaSeriesById
)

router.post(
  "/mega-series/:seriesId/occurrences",
  authorizeRoles(ROLE_GROUPS.ADMIN_LEVEL),
  ...megaEventsCreateAccess,
  validate(validation.megaSeriesIdSchema, "params"),
  validate(validation.createMegaOccurrenceSchema),
  eventsController.createMegaOccurrence
)

// ═══════════════════════════════════════════════════════════════════════════════
// PROPOSAL ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Get events needing proposals (GS dashboard)
router.get(
  "/pending-proposals",
  authorizeRoles([ROLES.GYMKHANA]),
  ...eventsCreateAccess,
  validate(validation.pendingProposalsQuerySchema, "query"),
  eventsController.getPendingProposals
)

// Get proposals pending my approval
router.get(
  "/proposals/pending",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsApproveAccess,
  eventsController.getProposalsForApproval
)

// Submit proposal for event (GS only)
router.post(
  "/events/:eventId/proposal",
  authorizeRoles([ROLES.GYMKHANA]),
  ...eventsCreateAccess,
  validate(validation.createProposalSchema),
  eventsController.createProposal
)

// Get proposal for event
router.get(
  "/events/:eventId/proposal",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getProposalByEvent
)

// Get proposal by ID
router.get(
  "/proposals/:id",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getProposalById
)

// Update proposal (after revision request, GS only)
router.put(
  "/proposals/:id",
  authorizeRoles([ROLES.GYMKHANA]),
  ...eventsCreateAccess,
  validate(validation.updateProposalSchema),
  eventsController.updateProposal
)

// Approve proposal
router.post(
  "/proposals/:id/approve",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsApproveAccess,
  validate(validation.approvalActionSchema),
  eventsController.approveProposal
)

// Reject proposal
router.post(
  "/proposals/:id/reject",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsApproveAccess,
  validate(validation.rejectionSchema),
  eventsController.rejectProposal
)

// Request revision
router.post(
  "/proposals/:id/revision",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsApproveAccess,
  validate(validation.approvalActionSchema),
  eventsController.requestProposalRevision
)

// Get proposal history
router.get(
  "/proposals/:id/history",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getProposalHistory
)

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Get all expenses (admin view)
router.get(
  "/expenses",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getAllExpenses
)

// Submit expense for event (GS only)
router.post(
  "/events/:eventId/expenses",
  authorizeRoles([ROLES.GYMKHANA]),
  ...eventsCreateAccess,
  validate(validation.createExpenseSchema),
  eventsController.submitExpense
)

// Get expense for event
router.get(
  "/events/:eventId/expenses",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getExpenseByEvent
)

// Update expense (GS only)
router.put(
  "/expenses/:id",
  authorizeRoles([ROLES.GYMKHANA]),
  ...eventsCreateAccess,
  validate(validation.updateExpenseSchema),
  eventsController.updateExpense
)

// Get expense history
router.get(
  "/expenses/:id/history",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getExpenseHistory
)

// Approve expense submission (Admin only)
router.post(
  "/expenses/:id/approve",
  authorizeRoles(ROLE_GROUPS.ADMIN_LEVEL),
  ...eventsApproveAccess,
  validate(validation.approvalActionSchema),
  eventsController.approveExpense
)

// Reject expense submission (Admin only)
router.post(
  "/expenses/:id/reject",
  authorizeRoles(ROLE_GROUPS.ADMIN_LEVEL),
  ...eventsApproveAccess,
  validate(validation.rejectionSchema),
  eventsController.rejectExpense
)

// ═══════════════════════════════════════════════════════════════════════════════
// GENERAL EVENT ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Get gymkhana dashboard summary
router.get(
  "/dashboard/summary",
  authorizeRoles([ROLES.GYMKHANA]),
  requireGymkhanaDashboardRouteAccess,
  eventsController.getGymkhanaDashboardSummary
)

// Get gymkhana profile
router.get(
  "/profile",
  authorizeRoles([ROLES.GYMKHANA]),
  requireRouteAccess("route.gymkhana.profile"),
  eventsController.getGymkhanaProfile
)

// Get calendar view (for calendar display)
router.get(
  "/calendar-view",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getCalendarView
)

// Get all events
router.get(
  "/",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  validate(validation.eventsQuerySchema, "query"),
  eventsController.getEvents
)

// Get event by ID
router.get(
  "/:id",
  authorizeRoles([...ROLE_GROUPS.CAN_APPROVE_EVENTS]),
  ...eventsViewAccess,
  eventsController.getEventById
)

export default router
