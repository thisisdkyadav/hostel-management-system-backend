import express from "express"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { getOnlineUsers, getOnlineStats, getOnlineUserByUserId } from "../controllers/onlineUsersController.js"

const router = express.Router()

// All routes require authentication
router.use(authenticate)

// Get currently online users (Admin and Super Admin only)
router.get("/", authorizeRoles(["Admin", "Super Admin"]), getOnlineUsers)

// Get online users statistics (Admin and Super Admin only)
router.get("/stats", authorizeRoles(["Admin", "Super Admin"]), getOnlineStats)

// Get online status of specific user
router.get("/:userId", getOnlineUserByUserId)

export default router
