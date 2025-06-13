import express from "express"
import { getSecurity, verifyQR, addStudentEntryWithEmail, addVisitor, getVisitors, updateVisitor, addStudentEntry, getRecentEntries, updateStudentEntry, getStudentEntries, deleteStudentEntry, deleteVisitor } from "../controllers/securityController.js"

import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"
const router = express.Router()
router.use(authenticate)

router.get("/", getSecurity)

router.get("/entries", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate", "Student"]), requirePermission("students_info", "view"), getStudentEntries)
router.get("/entries/recent", authorizeRoles(["Hostel Gate"]), getRecentEntries)
router.post("/entries", authorizeRoles(["Hostel Gate"]), addStudentEntry)
router.post("/entries/email", authorizeRoles(["Hostel Gate"]), addStudentEntryWithEmail)

router.put("/entries/:entryId", authorizeRoles(["Hostel Gate"]), updateStudentEntry)
router.delete("/entries/:entryId", authorizeRoles(["Hostel Gate"]), deleteStudentEntry)
router.post("/verify-qr", authorizeRoles(["Hostel Gate"]), verifyQR)

export default router
