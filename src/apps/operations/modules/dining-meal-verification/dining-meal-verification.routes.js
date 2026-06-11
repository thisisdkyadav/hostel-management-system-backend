import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import {
  getAvailableStudents,
  getMealVerificationContext,
  getMealVerificationFeed,
  getRebateSummary,
  manuallyVerifyMeal,
} from "./dining-meal-verification.controller.js"

const router = express.Router()

router.use(authenticate)
router.use(authorizeRoles(["Caterer"]))

const routeAccessByRole = {
  Caterer: "route.caterer.mealVerification",
}

router.use((req, res, next) => {
  const routeKey = routeAccessByRole[req?.user?.role]
  if (!routeKey) {
    return res.status(403).json({ success: false, message: "You do not have access to this route" })
  }
  return requireRouteAccess(routeKey)(req, res, next)
})

router.get("/context", getMealVerificationContext)
router.get("/feed", getMealVerificationFeed)
router.get("/available-students", getAvailableStudents)
router.get("/rebate-summary", getRebateSummary)
router.post("/manual", manuallyVerifyMeal)

export default router
