import express from "express"
import { createEvent, getEvents, updateEvent, deleteEvent } from "../controllers/eventController.js"

import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

router.use(authenticate)
router.post("/", authorizeRoles(["Admin", "Warden"]), createEvent)
router.delete("/:id", authorizeRoles(["Admin", "Warden"]), deleteEvent)
router.put("/:id", authorizeRoles(["Admin", "Warden"]), updateEvent)
router.get("/", authorizeRoles(["Admin", "Warden", "Student"]), getEvents)

export default router
