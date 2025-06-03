import express from "express"
import { createLostAndFound, getLostAndFound, updateLostAndFound, deleteLostAndFound } from "../controllers/lostAndFoundController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()
router.use(authenticate)

router.get("/", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Student"]), getLostAndFound)
router.post("/", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), createLostAndFound)
router.put("/:id", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), updateLostAndFound)
router.delete("/:id", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security"]), deleteLostAndFound)

export default router
