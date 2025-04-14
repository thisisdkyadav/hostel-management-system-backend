import express from "express"
import { getWardenProfile, setActiveHostel } from "../controllers/wardenController.js"
import { getAssociateWardenProfile, setActiveHostelAW } from "../controllers/associateWardenController.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.get("/profile", authorizeRoles(["Warden"]), getWardenProfile)

router.put("/active-hostel", authorizeRoles(["Warden"]), setActiveHostel)

router.get("/associate-warden/profile", authorizeRoles(["Associate Warden"]), getAssociateWardenProfile)

router.put("/associate-warden/active-hostel", authorizeRoles(["Associate Warden"]), setActiveHostelAW)

export default router
