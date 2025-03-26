import express from "express"
import { getSecurity, addVisitor, getVisitors, updateVisitor, addStudentEntry, getRecentEntries, updateStudentEntry, getStudentEntries, deleteStudentEntry, deleteVisitor } from "../controllers/securityController.js"

import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()
router.use(authenticate)

router.get("/", getSecurity)

router.get("/visitors", authorizeRoles(["Admin", "Warden", "Security"]), getVisitors)
router.post("/visitors", authorizeRoles(["Admin", "Warden", "Security"]), addVisitor)
router.put("/visitors/:visitorId", authorizeRoles(["Admin", "Warden", "Security"]), updateVisitor)
router.delete("/visitors/:visitorId", authorizeRoles(["Admin", "Warden", "Security"]), deleteVisitor)

router.get("/entries", authorizeRoles(["Admin", "Warden", "Security"]), getStudentEntries)
router.get("/entries/recent", authorizeRoles(["Admin", "Warden", "Security"]), getRecentEntries)
router.post("/entries", authorizeRoles(["Admin", "Warden", "Security"]), addStudentEntry)
router.put("/entries/:entryId", authorizeRoles(["Admin", "Warden", "Security"]), updateStudentEntry)
router.delete("/entries/:entryId", authorizeRoles(["Admin", "Warden", "Security"]), deleteStudentEntry)

export default router
