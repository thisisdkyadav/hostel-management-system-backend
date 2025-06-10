import express from "express"
import { getSecurity, verifyQR, addStudentEntryWithEmail, addVisitor, getVisitors, updateVisitor, addStudentEntry, getRecentEntries, updateStudentEntry, getStudentEntries, deleteStudentEntry, deleteVisitor } from "../controllers/securityController.js"

import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()
router.use(authenticate)

router.get("/", getSecurity)

router.get("/visitors", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), getVisitors)
router.post("/visitors", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), addVisitor)
router.put("/visitors/:visitorId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), updateVisitor)
router.delete("/visitors/:visitorId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), deleteVisitor)

router.get("/entries", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), getStudentEntries)
router.get("/entries/recent", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), getRecentEntries)
router.post("/entries", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), addStudentEntry)
router.post("/entries/email", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), addStudentEntryWithEmail)

router.put("/entries/:entryId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), updateStudentEntry)
router.delete("/entries/:entryId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), deleteStudentEntry)
router.post("/verify-qr", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), verifyQR)

export default router
