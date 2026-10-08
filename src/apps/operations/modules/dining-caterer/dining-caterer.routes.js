import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { mealRecordOptions, mealRecordOverview, mealRecords, rebateOverview, rebateDay, rebates } from "./dining-caterer.controller.js"

const router = express.Router()
router.use(authenticate)
router.use(authorizeRoles(["Dining"]))
router.use((req, res, next) => {
  if (req.user?.subRole !== "Caterer") {
    return res.status(403).json({ success: false, message: "You do not have access to this route" })
  }
  next()
})
const mealAccess = requireRouteAccess("route.caterer.mealRecords")
const rebateAccess = requireRouteAccess("route.caterer.rebates")
router.get("/meal-records/options", mealAccess, mealRecordOptions)
router.get("/meal-records/overview", mealAccess, mealRecordOverview)
router.get("/meal-records", mealAccess, mealRecords)
router.get("/rebates/overview", rebateAccess, rebateOverview)
router.get("/rebates/day", rebateAccess, rebateDay)
router.get("/rebates", rebateAccess, rebates)
export default router
