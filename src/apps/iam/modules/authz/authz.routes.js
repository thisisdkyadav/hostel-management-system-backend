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
} from "./authz.module.js"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"

const router = express.Router()

router.use(authenticate)

router.get("/catalog", getAuthzCatalog)
router.get("/me", getMyAuthz)

router.use(authorizeRoles(["Super Admin"]))
router.use(requireRouteAccess("route.superAdmin.authz"))

router.get("/users/:role?", getUsersByRole)
router.get("/user/:userId", getUserAuthz)
router.put("/user/:userId", updateUserAuthz)
router.post("/user/:userId/reset", resetUserAuthz)

export default router
