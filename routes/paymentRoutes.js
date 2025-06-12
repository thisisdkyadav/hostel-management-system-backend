import express from "express"
import { createPaymentLink, checkPaymentStatus } from "../controllers/paymentController.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"

const router = express.Router()

router.post("/create-link", authorizeRoles(["Admin"]), createPaymentLink)
router.get("/status/:paymentLinkId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Student"]), requirePermission("visitors", "view"), checkPaymentStatus)

export default router
