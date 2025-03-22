import express from "express"
import { getSecurity, addVisitor, getVisitors, updateVisitor, addStudentEntry, getRecentEntries, updateStudentEntry, getStudentEntries } from "../controllers/securityController.js"

import { authenticate } from "../middlewares/auth.js"
const router = express.Router()

// Middleware to authenticate and authorize admin
router.use(authenticate)

router.get("/info", getSecurity)
router.post("/visitors", addVisitor)
router.get("/visitors", getVisitors)
router.put("/visitors/:visitorId", updateVisitor)

router.post("/entries", addStudentEntry)
router.put("/entries/:entryId", updateStudentEntry)
router.get("/entries/recent", getRecentEntries)
router.get("/entries", getStudentEntries)

export default router
