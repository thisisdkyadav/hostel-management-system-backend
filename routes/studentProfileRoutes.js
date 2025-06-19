import express from "express"
import { updateStudentProfile, getStudentProfile, getEditableProfile, getFamilyMembers, addFamilyMember, updateFamilyMember, deleteFamilyMember } from "../controllers/studentProfileController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

router.use(authenticate)
router.use(authorizeRoles(["Student"]))

// Student profile routes - require student role
router.get("/", getStudentProfile)
router.get("/editable", getEditableProfile)
router.put("/", updateStudentProfile)

router.get("/family-members", getFamilyMembers)
router.post("/family-members", addFamilyMember)
router.put("/family-members/:id", updateFamilyMember)
router.delete("/family-members/:id", deleteFamilyMember)

export default router
