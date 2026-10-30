import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { mealRecordOptions, mealRecordOverview, mealRecords, menu, rebateOverview, rebateDay, rebates } from "./dining-caterer.controller.js"

const catererOnly = (req, res, next) => {
  if (req.user?.subRole !== "Caterer") {
    return res.status(403).json({ success: false, message: "You do not have access to this route" })
  }
  next()
}
const menuAccess = requireRouteAccess("route.caterer.menu")

const router = express.Router()
router.use(authenticate)
router.use(authorizeRoles(["Dining"]))
router.use(catererOnly)
const mealAccess = requireRouteAccess("route.caterer.mealRecords")
const rebateAccess = requireRouteAccess("route.caterer.rebates")
router.get("/meal-records/options", mealAccess, mealRecordOptions)
router.get("/meal-records/overview", mealAccess, mealRecordOverview)
router.get("/meal-records", mealAccess, mealRecords)
router.get("/rebates/overview", rebateAccess, rebateOverview)
router.get("/rebates/day", rebateAccess, rebateDay)
router.get("/rebates", rebateAccess, rebates)
router.get("/menu", menuAccess, menu)
export default router

/** /api/v1/caterer: the caterer's own menu (same as /dining-caterer/menu). */
export const catererMenuRoutes = express.Router()
catererMenuRoutes.use(authenticate)
catererMenuRoutes.use(authorizeRoles(["Dining"]))
catererMenuRoutes.use(catererOnly)
catererMenuRoutes.get("/menu", menuAccess, menu)
