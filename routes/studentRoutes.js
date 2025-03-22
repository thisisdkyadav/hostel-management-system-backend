import express from "express"
import {
  createStudentsProfile,
  getStudents,
  getStudentDetails,
  getStudentProfile,
  updateStudentProfile,
  requestRoomChange,
  getRoomChangeRequestStatus,
  updateRoomChangeRequest,
  deleteRoomChangeRequest,
  fileComplaint,
  getAllComplaints,
  updateComplaint,
  deleteComplaint,
} from "../controllers/studentController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

// Student profile routes
router.post("/profiles", authenticate, authorizeRoles(["Admin", "Warden"]), createStudentsProfile)
router.get("/profiles", authenticate, authorizeRoles(["Admin", "Warden"]), getStudents)
router.get("/profile/details/:studentProfileId", authenticate, authorizeRoles(["Admin", "Warden"]), getStudentDetails)

router.get("/profiles/:userId", authenticate, getStudentProfile)
router.put("/profiles/:userId", authenticate, updateStudentProfile)

// Room change request routes
router.post("/:userId/room-change", authenticate, requestRoomChange)
router.get("/:userId/room-change", authenticate, getRoomChangeRequestStatus)
router.put("/:userId/room-change", authenticate, updateRoomChangeRequest)
router.delete("/:userId/room-change", authenticate, deleteRoomChangeRequest)

// Complaint routes
router.post("/:userId/complaints", authenticate, fileComplaint)
router.get("/:userId/complaints", authenticate, getAllComplaints)
router.put("/complaints/:complaintId", authenticate, updateComplaint)
router.delete("/complaints/:complaintId", authenticate, deleteComplaint)

export default router
