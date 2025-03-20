import express from "express"
import { getSecurity } from "../controllers/securityController.js"

import { authenticate } from "../middlewares/auth.js"
const router = express.Router()

// Middleware to authenticate and authorize admin
router.use(authenticate)

router.get("/info", getSecurity)

export default router
