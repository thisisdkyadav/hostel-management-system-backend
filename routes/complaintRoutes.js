import express from "express"
import { createComplaint, getAllComplaints, updateComplaintStatus, getStats, getStudentComplaints, complaintStatusUpdate, updateComplaintResolutionNotes, updateComplaintFeedback } from "../controllers/complaintController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"
const router = express.Router()
router.use(authenticate)

router.post("/", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Maintenance Staff", "Student"]), requirePermission("complaints", "create"), createComplaint)
router.get("/all", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Maintenance Staff", "Student"]), requirePermission("complaints", "view"), getAllComplaints)

router.get("/student/complaints/:userId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "view"), getStudentComplaints)

router.put("/update-status/:id", authorizeRoles(["Maintenance Staff"]), updateComplaintStatus)
router.get("/stats", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Maintenance Staff", "Student"]), getStats)

router.put("/:complaintId/status", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Maintenance Staff"]), complaintStatusUpdate)
router.put("/:complaintId/resolution-notes", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Maintenance Staff"]), updateComplaintResolutionNotes)

router.post("/:complaintId/feedback", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Student"]), updateComplaintFeedback)

export default router
