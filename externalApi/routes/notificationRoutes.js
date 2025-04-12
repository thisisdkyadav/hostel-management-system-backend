import express from "express"
import { searchNotifications } from "../controllers/notificationApi.js"

const router = express.Router()

router.route("/search").get(searchNotifications)

export default router
