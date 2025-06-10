import express from "express"
import { verifyQR, recordAttendance, getAttendanceRecords } from "../controllers/staffAttendanceController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

// All routes are protected and require authentication
router.use(authenticate)

// Route to verify QR code for staff attendance
router.post("/verify-qr", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), verifyQR)

// Route to record staff attendance (check-in or check-out)
router.post("/attendance/record", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), recordAttendance)

// Route to get staff attendance records
router.get("/attendance/records", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), getAttendanceRecords)

export default router
