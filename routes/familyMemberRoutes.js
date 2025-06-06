import express from "express"
import { createFamilyMember, getFamilyMembers, updateFamilyMember, deleteFamilyMember } from "../controllers/familyMemberController.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()

router.use(authenticate)
router.use(authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]))

router.post("/:userId", createFamilyMember)
router.get("/:userId", getFamilyMembers)
router.put("/:id", updateFamilyMember)
router.delete("/:id", deleteFamilyMember)

export default router
