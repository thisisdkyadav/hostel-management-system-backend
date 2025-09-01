import express from "express"
import {
  createUndertaking,
  getAllUndertakings,
  updateUndertaking,
  deleteUndertaking,
  getAssignedStudents,
  addStudentsToUndertaking,
  removeStudentFromUndertaking,
  getUndertakingStatus,
  getStudentPendingUndertakings,
  getUndertakingDetails,
  acceptUndertaking,
  getStudentAcceptedUndertakings,
  getStudentPendingUndertakingsCount,
} from "../controllers/undertakingController.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.use(authenticate)

// Admin/Staff routes
router.get("/admin/undertakings", authorizeRoles(["Admin", "Warden", "AssociateWarden", "Hostel Supervisor"]), getAllUndertakings)
router.post("/admin/undertakings", authorizeRoles(["Admin", "Warden", "AssociateWarden"]), createUndertaking)
router.put("/admin/undertakings/:undertakingId", authorizeRoles(["Admin", "Warden", "AssociateWarden"]), updateUndertaking)
router.delete("/admin/undertakings/:undertakingId", authorizeRoles(["Admin", "Warden", "AssociateWarden"]), deleteUndertaking)
router.get("/admin/undertakings/:undertakingId/students", authorizeRoles(["Admin", "Warden", "AssociateWarden", "Hostel Supervisor"]), getAssignedStudents)
router.post("/admin/undertakings/:undertakingId/students/by-roll-numbers", authorizeRoles(["Admin", "Warden", "AssociateWarden"]), addStudentsToUndertaking)
router.delete("/admin/undertakings/:undertakingId/students/:studentId", authorizeRoles(["Admin", "Warden", "AssociateWarden"]), removeStudentFromUndertaking)
router.get("/admin/undertakings/:undertakingId/status", authorizeRoles(["Admin", "Warden", "AssociateWarden", "Hostel Supervisor"]), getUndertakingStatus)

// Student routes
router.get("/student/undertakings/pending", authorizeRoles(["Student"]), getStudentPendingUndertakings)
router.get("/student/undertakings/accepted", authorizeRoles(["Student"]), getStudentAcceptedUndertakings)
router.get("/student/undertakings/:undertakingId", authorizeRoles(["Student"]), getUndertakingDetails)
router.post("/student/undertakings/:undertakingId/accept", authorizeRoles(["Student"]), acceptUndertaking)
router.get("/student/undertakings/pending/count", authorizeRoles(["Student"]), getStudentPendingUndertakingsCount)

export default router
