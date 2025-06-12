import express from "express"
import { createEvent, getEvents, updateEvent, deleteEvent } from "../controllers/eventController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"

const router = express.Router()

router.use(authenticate)
router.post("/", authorizeRoles(["Admin"]), createEvent)
router.delete("/:id", authorizeRoles(["Admin"]), deleteEvent)
router.put("/:id", authorizeRoles(["Admin"]), updateEvent)
router.get("/", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Student"]), requirePermission("events", "view"), getEvents)

export default router
