import express from "express"
import { createLeave, getMyLeaves, getLeaves, approveLeave, rejectLeave, joinLeave } from "../controllers/leaveController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
const router = express.Router()
router.use(authenticate)

router.use(authorizeRoles(["Admin", "Hostel Supervisor", "Maintenance Staff"]))
router.get("/my-leaves", getMyLeaves)
router.post("/", createLeave)

router.use(authorizeRoles(["Admin"]))
router.get("/all", getLeaves)
router.put("/:id/approve", approveLeave)
router.put("/:id/reject", rejectLeave)
router.put("/:id/join", joinLeave)

export default router
