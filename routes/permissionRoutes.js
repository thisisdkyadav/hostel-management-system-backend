import express from "express"
import { getUserPermissions, updateUserPermissions, resetUserPermissions, getUsersByRole, resetRolePermissions, setRolePermissions } from "../controllers/permissionController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"

const router = express.Router()

// Protect all routes
router.use(authenticate)
router.use(authorizeRoles(["Admin"]))

// Get users by role
router.get("/users/:role?", getUsersByRole)

// Get permissions for a specific user
router.get("/user/:userId", getUserPermissions)

// Update permissions for a specific user
router.put("/user/:userId", updateUserPermissions)

// Reset permissions for a specific user to role defaults
router.post("/user/:userId/reset", resetUserPermissions)

// Reset permissions for all users with a specific role
router.post("/role/:role/reset", resetRolePermissions)

// Set custom permissions for all users with a specific role
router.put("/role/:role", setRolePermissions)

export default router
