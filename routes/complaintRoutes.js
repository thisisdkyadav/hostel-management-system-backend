import express from "express"
import { createComplaint, getAllComplaints, updateComplaintStatus, getStats } from "../controllers/complaintController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.post("/complaint/add", createComplaint)
router.get("/all", getAllComplaints)
router.put("/update-status/:id", updateComplaintStatus)
router.get("/stats", getStats)

export default router
