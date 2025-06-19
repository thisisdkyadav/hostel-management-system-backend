import express from "express"
import { addDisCoAction, getDisCoActionsByStudent, updateDisCoAction, deleteDisCoAction } from "../controllers/disCoController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"

const router = express.Router()
router.use(authenticate)

router.post("/add", authorizeRoles(["Admin"]), addDisCoAction)
router.get("/:studentId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "view"), getDisCoActionsByStudent)
router.put("/update/:disCoId", authorizeRoles(["Admin"]), updateDisCoAction)
router.delete("/:disCoId", authorizeRoles(["Admin"]), deleteDisCoAction)

export default router
