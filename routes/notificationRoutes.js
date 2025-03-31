import express from "express"
import { createNotification, getNotificationStats, getNotifications } from "../controllers/notificationController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.get("/", getNotifications)
router.post("/", createNotification)
router.get("/stats", getNotificationStats)

export default router
