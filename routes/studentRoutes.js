import express from "express"
import {
  createStudentsProfiles,
  getStudents,
  getStudentDetails,
  getStudentProfile,
  updateStudentProfile,
  fileComplaint,
  getAllComplaints,
  updateComplaint,
  deleteComplaint,
  updateStudentsProfiles,
  getMultipleStudentDetails,
  getStudentDashboard,
  getStudentIdCard,
  uploadStudentIdCard,
  bulkUpdateStudentsStatus,
  bulkUpdateDayScholarDetails,
  getStudentId,
} from "../controllers/studentController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"
const router = express.Router()

router.use(authenticate)

router.get("/dashboard", authorizeRoles(["Student"]), getStudentDashboard)

router.get("/profile", authorizeRoles(["Student"]), getStudentProfile)
router.get("/id/:userId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getStudentId)

router.get("/profiles", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "view"), getStudents)
router.post("/profiles", authorizeRoles(["Admin"]), createStudentsProfiles)
router.put("/profiles", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "edit"), updateStudentsProfiles)
router.post("/profiles/ids", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "view"), getMultipleStudentDetails)
router.get("/profile/details/:userId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "view"), getStudentDetails)
router.put("/profile/:userId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "edit"), updateStudentProfile)
router.post("/profiles/status", authorizeRoles(["Admin"]), bulkUpdateStudentsStatus)
router.put("/profiles/day-scholar", authorizeRoles(["Admin"]), bulkUpdateDayScholarDetails)

// Complaint routes
router.post("/:userId/complaints", authorizeRoles(["Student"]), requirePermission("complaints", "create"), fileComplaint)
router.get("/:userId/complaints", authorizeRoles(["Student"]), requirePermission("complaints", "view"), getAllComplaints)
router.put("/complaints/:complaintId", authorizeRoles(["Student"]), requirePermission("complaints", "edit"), updateComplaint)
router.delete("/complaints/:complaintId", authorizeRoles(["Student"]), requirePermission("complaints", "delete"), deleteComplaint)

// Student ID routes
router.get("/:userId/id-card", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Student"]), requirePermission("students_info", "view"), getStudentIdCard)
router.post("/:userId/id-card", authorizeRoles(["Student"]), uploadStudentIdCard)

export default router
