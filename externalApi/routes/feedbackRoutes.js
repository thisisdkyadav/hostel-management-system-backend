import express from "express"
import { searchFeedback } from "../controllers/feedbackApi.js"

const router = express.Router()

router.route("/search").get(searchFeedback)

export default router
