import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { overview } from "./dining-insights.controller.js"

const router = express.Router()
// Same keys as GET /dashboard, plus the Dining Office dashboard (caterer logins lack that key).
const guard = routeGuard({
  Admin: "route.admin.dashboard",
  "Super Admin": "route.superAdmin.dashboard",
  Dining: "route.diningOffice.dashboard",
})
router.use(authenticate)
router.get("/overview", guard(["Admin", "Super Admin", "Dining"]), overview)
export default router
