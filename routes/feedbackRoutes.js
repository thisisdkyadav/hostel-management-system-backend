import express from "express"
import { createFeedback, getStudentFeedbacks, getFeedbacks, updateFeedbackStatus, replyToFeedback, updateFeedback, deleteFeedback } from "../controllers/feedbackController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.post("/add", createFeedback)
router.get("/", getFeedbacks)
router.get("/student/:userId", getStudentFeedbacks)
router.put("/:feedbackId", updateFeedback)
router.delete("/:feedbackId", deleteFeedback)
router.put("/update-status/:feedbackId", updateFeedbackStatus)
router.post("/reply/:feedbackId", replyToFeedback)

export default router
