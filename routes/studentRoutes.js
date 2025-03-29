import express from "express"
import {
  createStudentsProfiles,
  getStudents,
  getStudentDetails,
  getStudentProfile,
  updateStudentProfile,
  // createRoomChangeRequest,
  // getRoomChangeRequestStatus,
  // updateRoomChangeRequest,
  // deleteRoomChangeRequest,
  fileComplaint,
  getAllComplaints,
  updateComplaint,
  deleteComplaint,
  updateStudentsProfiles,
  getMultipleStudentDetails,
  getStudentDashboard,
} from "../controllers/studentController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

router.use(authenticate)

router.get("/dashboard", authorizeRoles(["Student"]), getStudentDashboard)

router.get("/profile", authorizeRoles(["Student"]), getStudentProfile)

router.get("/profiles", authorizeRoles(["Admin", "Warden", "Associate Warden"]), getStudents)
router.post("/profiles", authorizeRoles(["Admin", "Warden", "Associate Warden"]), createStudentsProfiles)
router.put("/profiles", authorizeRoles(["Admin", "Warden", "Associate Warden"]), updateStudentsProfiles)
router.post("/profiles/ids", authorizeRoles(["Admin", "Warden", "Associate Warden"]), getMultipleStudentDetails)
router.get("/profile/details/:userId", authorizeRoles(["Admin", "Warden", "Associate Warden"]), getStudentDetails)
router.put("/profile/:userId", authorizeRoles(["Admin", "Warden", "Associate Warden"]), updateStudentProfile)

// Room change request routes
// router.post("/room-change", createRoomChangeRequest)
// router.get("/room-change", getRoomChangeRequestStatus)
// router.put("/room-change", updateRoomChangeRequest)
// router.delete("/room-change", deleteRoomChangeRequest)

// Complaint routes
router.post("/:userId/complaints", fileComplaint)
router.get("/:userId/complaints", getAllComplaints)
router.put("/complaints/:complaintId", updateComplaint)
router.delete("/complaints/:complaintId", deleteComplaint)

export default router
