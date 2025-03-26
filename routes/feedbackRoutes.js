import express from "express"
import { createFeedback, getFeedbacks, updateFeedbackStatus } from "../controllers/feedbackController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.post("/add", createFeedback)
router.get("/all/:hostelId", getFeedbacks)
router.put("/update-status/:feedbackId", updateFeedbackStatus)

export default router
