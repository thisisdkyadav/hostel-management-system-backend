import express from "express"
import { getWardenProfile, setActiveHostel } from "../controllers/wardenController.js"
import { getAssociateWardenProfile, setActiveHostelAW } from "../controllers/associateWardenController.js"
import { getHostelSupervisorProfile, setActiveHostelHS } from "../controllers/hostelSupervisorController.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.get("/profile", authorizeRoles(["Warden"]), getWardenProfile)

router.put("/active-hostel", authorizeRoles(["Warden"]), setActiveHostel)

router.get("/associate-warden/profile", authorizeRoles(["Associate Warden"]), getAssociateWardenProfile)

router.put("/associate-warden/active-hostel", authorizeRoles(["Associate Warden"]), setActiveHostelAW)

router.get("/hostel-supervisor/profile", authorizeRoles(["Hostel Supervisor"]), getHostelSupervisorProfile)

router.put("/hostel-supervisor/active-hostel", authorizeRoles(["Hostel Supervisor"]), setActiveHostelHS)

export default router
