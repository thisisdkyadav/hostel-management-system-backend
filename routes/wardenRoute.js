import express from "express"
import { getWardenProfile } from "../controllers/wardenController.js"
import { getAssociateWardenProfile } from "../controllers/associateWardenController.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.get("/profile", authorizeRoles(["Warden"]), getWardenProfile)

router.get("/associate-warden/profile", authorizeRoles(["Associate Warden"]), getAssociateWardenProfile)

export default router
