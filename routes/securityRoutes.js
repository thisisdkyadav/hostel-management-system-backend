import express from "express"
import { getSecurity, verifyQR, addVisitor, getVisitors, updateVisitor, addStudentEntry, getRecentEntries, updateStudentEntry, getStudentEntries, deleteStudentEntry, deleteVisitor } from "../controllers/securityController.js"

import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()
router.use(authenticate)

router.get("/", getSecurity)

router.get("/visitors", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), getVisitors)
router.post("/visitors", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), addVisitor)
router.put("/visitors/:visitorId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), updateVisitor)
router.delete("/visitors/:visitorId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), deleteVisitor)

router.get("/entries", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), getStudentEntries)
router.get("/entries/recent", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), getRecentEntries)
router.post("/entries", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), addStudentEntry)
router.put("/entries/:entryId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), updateStudentEntry)
router.delete("/entries/:entryId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), deleteStudentEntry)
router.post("/verify-qr", authorizeRoles(["Admin", "Warden", "Associate Warden", "Security"]), verifyQR)

export default router
