import express from "express"
import { createFamilyMember, getFamilyMembers, updateFamilyMember, deleteFamilyMember, updateBulkFamilyMembers } from "../controllers/familyMemberController.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { authenticate } from "../middlewares/auth.js"
import { requirePermission } from "../utils/permissions.js"

const router = express.Router()

router.use(authenticate)
router.use(authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]))

router.post("/bulk-update", requirePermission("students_info", "edit"), updateBulkFamilyMembers)
router.post("/:userId", requirePermission("students_info", "edit"), createFamilyMember)
router.get("/:userId", requirePermission("students_info", "view"), getFamilyMembers)
router.put("/:id", requirePermission("students_info", "edit"), updateFamilyMember)
router.delete("/:id", requirePermission("students_info", "edit"), deleteFamilyMember)

export default router
