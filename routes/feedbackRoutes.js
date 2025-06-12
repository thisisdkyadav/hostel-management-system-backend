import express from "express"
import { createFeedback, getStudentFeedbacks, getFeedbacks, updateFeedbackStatus, replyToFeedback, updateFeedback, deleteFeedback } from "../controllers/feedbackController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"

const router = express.Router()
router.use(authenticate)

router.post("/add", authorizeRoles(["Student"]), createFeedback)
router.get("/", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Student"]), requirePermission("feedback", "view"), getFeedbacks)
router.get("/student/:userId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "view"), getStudentFeedbacks)
router.put("/:feedbackId", authorizeRoles(["Student"]), updateFeedback)
router.delete("/:feedbackId", authorizeRoles(["Student"]), deleteFeedback)
router.put("/update-status/:feedbackId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), updateFeedbackStatus)
router.post("/reply/:feedbackId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), replyToFeedback)

export default router
