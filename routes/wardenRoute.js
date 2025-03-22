import express from "express"
import { getWardenProfile } from "../controllers/wardenController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.get("/profile", authenticate, getWardenProfile)

export default router
