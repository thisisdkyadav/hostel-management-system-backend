import express from "express"
import { getHostelSheetData, getAllocationSummary } from "../controllers/sheetController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()

router.use(authenticate)
router.use(authorizeRoles(["Admin", "Super Admin", "Warden", "Associate Warden"]))

// Get hostel sheet data for spreadsheet view
router.get("/hostel/:hostelId", getHostelSheetData)

// Get allocation summary (degrees vs hostels matrix)
router.get("/summary", getAllocationSummary)

export default router
