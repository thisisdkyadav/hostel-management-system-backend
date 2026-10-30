import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { caterers, copy, items, menu, putDates, putWeek, removeDates, removeWeek, versions } from "./dining-menu.controller.js"

/**
 * Dining Menu management: Admin and the Dining Office. Both use the admin
 * route key; caterer logins (Dining/Caterer) are refused before authz.
 * Caterers read their own kitchen via /dining-caterer/menu.
 */
const guard = routeGuard({
  Admin: "route.admin.diningMenu",
  Dining: "route.admin.diningMenu",
})
const officeOnly = (req, res, next) => {
  if (req.user?.role === "Dining" && req.user?.subRole !== "Office") {
    return res.status(403).json({ success: false, message: "You do not have access to this route" })
  }
  return next()
}

const router = express.Router()
router.use(authenticate)
router.use(guard(["Admin", "Dining"]))
router.use(officeOnly)
router.get("/caterers", caterers)
router.get("/versions", versions)
router.get("/items", items)
router.get("/", menu)
router.put("/week", putWeek)
router.delete("/week", removeWeek)
router.put("/dates", putDates)
router.delete("/dates", removeDates)
router.post("/copy", copy)
export default router
