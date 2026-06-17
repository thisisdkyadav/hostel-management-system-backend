import express from "express"

import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { getDashboard } from "./dining-office.controller.js"

const router = express.Router()

router.use(authenticate)
router.use(authorizeRoles(["Dining"]))

router.get("/dashboard", requireRouteAccess("route.diningOffice.dashboard"), getDashboard)

export default router
