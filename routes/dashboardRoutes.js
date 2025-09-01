import express from "express"
import { getDashboardData, getStudentStatistics, getHostelStatistics, getEventsData, getComplaintsStatistics, getStudentCount, getWardenHostelStatistics } from "../controllers/dashboardController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"

const router = express.Router()

// Protect all routes
router.use(authenticate)

// Main dashboard route - requires admin level access
router.get("/", authorizeRoles(["Admin", "Super Admin"]), getDashboardData)

router.get("/warden/hostel-statistics", authorizeRoles(["Warden", "Associate Warden", "Hostel Supervisor"]), getWardenHostelStatistics)

// Individual dashboard components
// Student statistics
router.get("/student-count", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "view"), getStudentCount)
router.get("/student-statistics", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "view"), getStudentStatistics)

// // Hostel statistics
// router.get("/hostels", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("dashboard", "view"), getHostelStatistics)

// // Events data
// router.get("/events", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("dashboard", "view"), getEventsData)

// // Complaints statistics
// router.get("/complaints", authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Maintenance Staff"]), requirePermission("dashboard", "view"), getComplaintsStatistics)

export default router
