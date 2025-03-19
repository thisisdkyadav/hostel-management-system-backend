import express from "express"
import { createComplaint, getAllComplaints } from "../controllers/complaintController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.post("/complaint/add", createComplaint)
router.get("/all", getAllComplaints)

export default router
