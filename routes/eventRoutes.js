import express from "express"
import { createEvent, getEvents, updateEvent, deleteEvent } from "../controllers/eventController.js"

import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

router.use(authenticate)
router.post("/", authorizeRoles(["Admin", "Warden", "Associate Warden"]), createEvent)
router.delete("/:id", authorizeRoles(["Admin", "Warden", "Associate Warden"]), deleteEvent)
router.put("/:id", authorizeRoles(["Admin", "Warden", "Associate Warden"]), updateEvent)
router.get("/", authorizeRoles(["Admin", "Warden", "Associate Warden", "Student"]), getEvents)

export default router
