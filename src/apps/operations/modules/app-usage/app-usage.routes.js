/**
 * App Usage Routes
 * Students' browsers report visits; admins see who uses the installed SMS app.
 *
 * Base path: /api/v1/app-usage
 */

import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { ping, stats } from "./app-usage.controller.js"

const router = express.Router()
router.use(authenticate)

const adminGuard = routeGuard({ Admin: "route.admin.appUsage" })

router.post("/ping", authorizeRoles(["Student"]), requireRouteAccess("route.student.dashboard"), ping)
router.get("/stats", adminGuard(["Admin"]), stats)

export default router
