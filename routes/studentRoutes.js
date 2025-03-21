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
  getAllLostAndFoundItems,
  addLostItem,
  deleteLostItem,
  claimLostItem,
  getUserLostItems,
  updateLostItem,
  fileComplaint,
  getAllComplaints,
  updateComplaint,
  deleteComplaint,
  getAllActivePolls,
  reactToPoll,
  removeReactionFromPoll,
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

// Lost and found routes
router.get("/lost-and-found", authenticate, getAllLostAndFoundItems)
router.post("/:userId/lost-and-found", authenticate, addLostItem)
router.delete("/lost-and-found/:itemId", authenticate, deleteLostItem)
router.post("/lost-and-found/:itemId/claim", authenticate, claimLostItem)
router.get("/:userId/lost-and-found", authenticate, getUserLostItems)
router.put("/lost-and-found/:itemId", authenticate, updateLostItem)

// Complaint routes
router.post("/:userId/complaints", authenticate, fileComplaint)
router.get("/:userId/complaints", authenticate, getAllComplaints)
router.put("/complaints/:complaintId", authenticate, updateComplaint)
router.delete("/complaints/:complaintId", authenticate, deleteComplaint)

// Poll routes
router.get("/polls", authenticate, getAllActivePolls)
router.post("/polls/:pollId/react", authenticate, reactToPoll)
router.delete("/polls/:pollId/react", authenticate, removeReactionFromPoll)

export default router
