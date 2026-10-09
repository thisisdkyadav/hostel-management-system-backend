import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { overview } from "./dining-insights.controller.js"

const router = express.Router()
// Identical role gate and requireRouteAccess keys to GET /dashboard.
const guard = routeGuard({ Admin: "route.admin.dashboard", "Super Admin": "route.superAdmin.dashboard" })
router.use(authenticate)
router.get("/overview", guard(["Admin", "Super Admin"]), overview)
export default router
