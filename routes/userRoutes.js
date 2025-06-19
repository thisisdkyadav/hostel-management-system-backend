import express from "express"
import { searchUsers, getUserById, getUsersByRole, bulkPasswordUpdate, removeUserPassword, removePasswordsByRole, bulkRemovePasswords } from "../controllers/userController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

// Apply authentication middleware to all routes
router.use(authenticate)

// Search users by name or email
router.get("/search", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), searchUsers)

// Get users by role
router.get("/by-role", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getUsersByRole)

// Bulk update user passwords
router.post("/bulk-password-update", authorizeRoles(["Super Admin", "Admin"]), bulkPasswordUpdate)

router.post("/bulk-remove-passwords", authorizeRoles(["Super Admin", "Admin"]), bulkRemovePasswords)

// Remove passwords for all users with a specific role
router.post("/remove-passwords-by-role", authorizeRoles(["Super Admin", "Admin"]), removePasswordsByRole)

// Remove password for a specific user
router.post("/:id/remove-password", authorizeRoles(["Super Admin", "Admin"]), removeUserPassword)

// Get user by ID
router.get("/:id", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getUserById)

export default router
