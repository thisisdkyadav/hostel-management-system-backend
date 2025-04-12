import express from "express"
import { getApiClients, deleteApiClient, createApiClient } from "../controllers/superAdminControllers.js"

const router = express.Router()

router.get("/api-clients", getApiClients)
router.delete("/api-clients/:clientId", deleteApiClient)
router.post("/api-clients", createApiClient)

export default router
