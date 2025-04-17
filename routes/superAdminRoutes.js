import express from "express"
import { getApiClients, deleteApiClient, createApiClient, createAdmin, getAdmins, updateAdmin, deleteAdmin, updateApiClient, getDashboardStats } from "../controllers/superAdminControllers.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

router.use(authenticate)
router.use(authorizeRoles(["Super Admin"]))

router.get("/dashboard", getDashboardStats)

router.get("/admins", getAdmins)
router.post("/admins", createAdmin)
router.put("/admins/:adminId", updateAdmin)
router.delete("/admins/:adminId", deleteAdmin)

router.get("/api-clients", getApiClients)
router.post("/api-clients", createApiClient)
router.put("/api-clients/:clientId", updateApiClient)
router.delete("/api-clients/:clientId", deleteApiClient)

export default router
