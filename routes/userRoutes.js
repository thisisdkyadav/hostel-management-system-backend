import express from "express"
import { searchUsers, getUserById, getUsersByRole } from "../controllers/userController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

// Apply authentication middleware to all routes
router.use(authenticate)

// Search users by name or email
router.get("/search", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden"]), searchUsers)

// Get users by role
router.get("/by-role", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden"]), getUsersByRole)

// Get user by ID
router.get("/:id", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden"]), getUserById)

export default router
