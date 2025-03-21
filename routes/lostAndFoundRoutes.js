import express from "express"
import { createLostAndFound, getLostAndFound, getActiveLostAndFound, getClaimedLostAndFound, updateLostAndFound, deleteLostAndFound } from "../controllers/lostAndFoundController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

// Middleware to authenticate and authorize admin
router.use(authenticate)

router.post("/lost-and-found", authorizeRoles(["Admin", "Warden", "Security"]), createLostAndFound)
router.delete("/lost-and-found/:id", authorizeRoles(["Admin", "Warden", "Security"]), deleteLostAndFound)
router.put("/lost-and-found/:id", authorizeRoles(["Admin", "Warden", "Security"]), updateLostAndFound)

router.get("/lost-and-found", getLostAndFound)
router.get("/active-lost-and-found", getActiveLostAndFound)
router.get("/claimed-lost-and-found", getClaimedLostAndFound)
