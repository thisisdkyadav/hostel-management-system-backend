import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { allocationPeriods, allocationRoster, studentAllocationHistory } from "./dining-allocations.controller.js"

/**
 * The Allocations page, shared by Admin, the Dining Office (wardens and hall
 * supervisors) and caterer logins. The service narrows a caterer to its own
 * kitchen; the route key depends on who is asking.
 */
const routeKeyFor = (user) => {
  if (user?.role === "Admin") return "route.admin.diningAllocations"
  if (user?.role === "Dining" && user?.subRole === "Office") return "route.admin.diningAllocations"
  if (user?.role === "Dining" && user?.subRole === "Caterer") return "route.caterer.students"
  return null
}

const router = express.Router()
router.use(authenticate)
router.use(authorizeRoles(["Admin", "Dining"]))
router.use((req, res, next) => {
  const routeKey = routeKeyFor(req.user)
  if (!routeKey) return res.status(403).json({ success: false, message: "You do not have access to this route" })
  return requireRouteAccess(routeKey)(req, res, next)
})
router.get("/periods", allocationPeriods)
router.get("/roster", allocationRoster)
router.get("/student-history", studentAllocationHistory)
export default router
