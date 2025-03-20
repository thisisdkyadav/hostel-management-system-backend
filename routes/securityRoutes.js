import express from "express"
import { getSecurity, addVisitor, getVisitors, updateVisitor } from "../controllers/securityController.js"

import { authenticate } from "../middlewares/auth.js"
const router = express.Router()

// Middleware to authenticate and authorize admin
router.use(authenticate)

router.get("/info", getSecurity)
router.post("/visitors", addVisitor)
router.get("/visitors", getVisitors)
router.put("/visitors/:visitorId", updateVisitor)

export default router
