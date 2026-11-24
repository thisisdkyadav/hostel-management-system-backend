/**
 * App Usage Routes
 * Students' browsers report visits; every user's browser reports the pages
 * they open; admins see who uses the installed SMS app and page activity.
 *
 * Base path: /api/v1/app-usage
 */

import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { ping, roles, stats, userActivity, users, visit } from "./app-usage.controller.js"

const router = express.Router()
router.use(authenticate)

const adminGuard = routeGuard({ Admin: "route.admin.appUsage" })

router.post("/ping", authorizeRoles(["Student"]), requireRouteAccess("route.student.dashboard"), ping)
router.get("/stats", adminGuard(["Admin"]), stats)

// Any logged-in user: the page they just opened (every role is tracked).
router.post("/visit", visit)
router.get("/roles", adminGuard(["Admin"]), roles)
router.get("/users", adminGuard(["Admin"]), users)
router.get("/users/:userId", adminGuard(["Admin"]), userActivity)

export default router
