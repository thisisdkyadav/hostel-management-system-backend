import express from "express"
import { getSecurity, verifyQR, addStudentEntryWithEmail, addVisitor, getVisitors, updateVisitor, addStudentEntry, getRecentEntries, updateStudentEntry, getStudentEntries, deleteStudentEntry, deleteVisitor } from "../controllers/securityController.js"

import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()
router.use(authenticate)

router.get("/", getSecurity)

router.get("/visitors", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), getVisitors)
router.post("/visitors", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), addVisitor)
router.put("/visitors/:visitorId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), updateVisitor)
router.delete("/visitors/:visitorId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), deleteVisitor)

router.get("/entries", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Student"]), getStudentEntries)
router.get("/entries/recent", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), getRecentEntries)
router.post("/entries", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), addStudentEntry)
router.post("/entries/email", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), addStudentEntryWithEmail)

router.put("/entries/:entryId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), updateStudentEntry)
router.delete("/entries/:entryId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), deleteStudentEntry)
router.post("/verify-qr", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), verifyQR)

export default router
