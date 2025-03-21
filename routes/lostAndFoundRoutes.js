import express from "express"
import { createLostAndFound, getLostAndFound, updateLostAndFound, deleteLostAndFound } from "../controllers/lostAndFoundController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

// Middleware to authenticate and authorize admin
router.use(authenticate)

router.post("/", authorizeRoles(["Admin", "Warden", "Security"]), createLostAndFound)
router.delete("/:id", authorizeRoles(["Admin", "Warden", "Security"]), deleteLostAndFound)
router.put("/:id", authorizeRoles(["Admin", "Warden", "Security"]), updateLostAndFound)

router.get("/", getLostAndFound)

export default router
