import express from "express"
import { createNotification, getNotificationStats, getNotifications, getActiveNotificationsCount } from "../controllers/notificationController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.get("/", getNotifications)
router.post("/", createNotification)
router.get("/stats", getNotificationStats)
router.get("/active-count", getActiveNotificationsCount)

export default router
