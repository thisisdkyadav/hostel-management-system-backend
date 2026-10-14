import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { dailyReport, mealFeed, mealPulse, mealRecordOptions, mealRecordOverview, mealRecords } from "../dining-caterer/dining-caterer.controller.js"

/**
 * The caterer meal-record views across every caterer, for Admin and the Dining
 * Office (wardens and hall supervisors). Same services as /dining-caterer; the
 * scope widens because the caller is not a caterer login. Gated on the caterer
 * management key both portals already hold.
 */
const router = express.Router()
router.use(authenticate)
router.use(authorizeRoles(["Admin", "Dining"]))
router.use((req, res, next) => {
  if (req.user?.role === "Dining" && req.user?.subRole !== "Office") {
    return res.status(403).json({ success: false, message: "You do not have access to this route" })
  }
  next()
})
router.use(requireRouteAccess("route.admin.caterers"))
router.get("/meal-records/options", mealRecordOptions)
router.get("/meal-records/overview", mealRecordOverview)
router.get("/meal-records/pulse", mealPulse)
router.get("/meal-records", mealRecords)
router.get("/feed", mealFeed)
router.get("/daily-report", dailyReport)
export default router
