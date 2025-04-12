import express from "express"
import { searchMaintenanceStaff } from "../controllers/maintenanceStaffApi.js"

const router = express.Router()

router.route("/search").get(searchMaintenanceStaff)

export default router
