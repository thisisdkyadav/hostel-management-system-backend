import express from "express"
import { createLostAndFound, getLostAndFound, updateLostAndFound, deleteLostAndFound } from "../controllers/lostAndFoundController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"

const router = express.Router()
router.use(authenticate)

router.get("/", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate", "Student"]), requirePermission("lost_and_found", "view"), getLostAndFound)
router.post("/", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), requirePermission("lost_and_found", "create"), createLostAndFound)
router.put("/:id", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), requirePermission("lost_and_found", "edit"), updateLostAndFound)
router.delete("/:id", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate"]), requirePermission("lost_and_found", "delete"), deleteLostAndFound)

export default router
