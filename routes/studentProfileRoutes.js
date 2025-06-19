import express from "express"
import { updateStudentProfile, getStudentProfile, getEditableProfile } from "../controllers/studentProfileController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

router.use(authenticate)
router.use(authorizeRoles(["Student"]))

// Student profile routes - require student role
router.get("/", getStudentProfile)
router.get("/editable", getEditableProfile)
router.put("/", updateStudentProfile)

export default router
