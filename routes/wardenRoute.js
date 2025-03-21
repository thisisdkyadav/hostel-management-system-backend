import express from "express"
import {
  getWardenProfile,
  // getResolvedAndPendingComplaints,
  // getAllComplaints,
  // assignComplaint,
  // getComplaintStatus,
  // createPoll,
  // getPollResults,
  // getRecentPolls,
  // createStudent
} from "../controllers/wardenController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.get("/profile", authenticate, getWardenProfile) // Get warden profile details

// // Complaint-related routes
// router.get("/complaints/status/:wardenId", getResolvedAndPendingComplaints)
// router.get("/complaints/:wardenId", getAllComplaints)
// router.post("/complaints/assign", assignComplaint)
// router.get("/complaints/details/:wardenId", getComplaintStatus)

// // Poll-related routes
// router.post("/polls/create/:wardenId", createPoll)
// router.get("/polls/results/:pollId", getPollResults)
// router.get("/polls/recent", getRecentPolls)

// // Student-related routes
// router.post("/students/create", createStudent) // Store student details

export default router
