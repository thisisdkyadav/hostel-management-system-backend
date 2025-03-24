import express from "express"
import {
  createStudentsProfiles,
  getStudents,
  getStudentDetails,
  getStudentProfile,
  updateStudentProfile,
  createRoomChangeRequest,
  getRoomChangeRequestStatus,
  updateRoomChangeRequest,
  deleteRoomChangeRequest,
  fileComplaint,
  getAllComplaints,
  updateComplaint,
  deleteComplaint,
  updateStudentsProfiles,
} from "../controllers/studentController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

// Student profile routes
router.post("/profiles", authenticate, authorizeRoles(["Admin", "Warden"]), createStudentsProfiles)
router.get("/profiles", authenticate, authorizeRoles(["Admin", "Warden"]), getStudents)
router.get("/profile/details/:userId", authenticate, authorizeRoles(["Admin", "Warden"]), getStudentDetails)

router.get("/profile", authenticate, getStudentProfile)
router.get("/profile/:userId", authenticate, getStudentProfile)
router.put("/profiles", authenticate, authorizeRoles(["Admin", "Warden"]), updateStudentsProfiles)
router.put("/profile/:userId", authenticate, authorizeRoles(["Admin", "Warden"]), updateStudentProfile)

// Room change request routes
router.post("/room-change", authenticate, createRoomChangeRequest)
router.get("/room-change", authenticate, getRoomChangeRequestStatus)
router.put("/room-change", authenticate, updateRoomChangeRequest)
router.delete("/room-change", authenticate, deleteRoomChangeRequest)

// Complaint routes
router.post("/:userId/complaints", authenticate, fileComplaint)
router.get("/:userId/complaints", authenticate, getAllComplaints)
router.put("/complaints/:complaintId", authenticate, updateComplaint)
router.delete("/complaints/:complaintId", authenticate, deleteComplaint)

export default router
