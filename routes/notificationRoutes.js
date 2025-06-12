import express from "express"
import { createNotification, getNotificationStats, getNotifications, getActiveNotificationsCount } from "../controllers/notificationController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()
router.use(authenticate)

router.post("/", authorizeRoles(["Admin"]), createNotification)

router.use(authorizeRoles(["Admin", "Student"]))
router.get("/", getNotifications)
router.get("/stats", getNotificationStats)
router.get("/active-count", getActiveNotificationsCount)

export default router
