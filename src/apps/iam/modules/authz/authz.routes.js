/**
 * AuthZ Routes
 * Base path: /api/v1/authz
 */

import express from "express"
import {
  getAuthzCatalog,
  getMyAuthz,
  getUserAuthz,
  getUsersByRole,
  resetUserAuthz,
  updateUserAuthz,
} from "./authz.controller.js"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireAnyCapability, requireRouteAccess } from "../../../../middlewares/authz.middleware.js"

const router = express.Router()

router.use(authenticate)

router.get("/catalog", getAuthzCatalog)
router.get("/me", getMyAuthz)

router.use(authorizeRoles(["Admin", "Super Admin"]))
const AUTHZ_ROUTE_KEY_BY_ROLE = {
  Admin: "route.admin.authz",
  "Super Admin": "route.superAdmin.authz",
}

const requireAuthzAdminRouteAccess = (req, res, next) => {
  const routeKey = AUTHZ_ROUTE_KEY_BY_ROLE[req?.user?.role]
  if (!routeKey) {
    return res.status(403).json({ success: false, message: "You do not have access to this route" })
  }
  return requireRouteAccess(routeKey)(req, res, next)
}

router.get("/users/:role?", requireAuthzAdminRouteAccess, requireAnyCapability(["cap.authz.view"]), getUsersByRole)
router.get("/user/:userId", requireAuthzAdminRouteAccess, requireAnyCapability(["cap.authz.view"]), getUserAuthz)
router.put("/user/:userId", requireAuthzAdminRouteAccess, requireAnyCapability(["cap.authz.update"]), updateUserAuthz)
router.post("/user/:userId/reset", requireAuthzAdminRouteAccess, requireAnyCapability(["cap.authz.update"]), resetUserAuthz)

export default router
