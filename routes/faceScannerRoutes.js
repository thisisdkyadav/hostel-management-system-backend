import express from "express"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { authenticateScanner } from "../middlewares/faceScannerAuth.js"
import {
  createFaceScanner,
  getAllFaceScanners,
  getFaceScannerById,
  updateFaceScanner,
  deleteFaceScanner,
  regeneratePassword,
  testScannerAuth,
} from "../controllers/faceScannerController.js"
import { processScan, ping } from "../controllers/scannerActionController.js"

const router = express.Router()

// =============================================
// Scanner Action Routes (use scanner Basic Auth)
// Automated - no manual verification needed
// =============================================
router.get("/ping", authenticateScanner, ping)
router.post("/scan", authenticateScanner, processScan)

// Test scanner authentication (for debugging)
router.get("/test-auth", authenticateScanner, testScannerAuth)

// =============================================
// Admin Management Routes (use session auth)
// These are called by the web dashboard
// =============================================
router.use(authenticate)
router.use(authorizeRoles(["Admin", "Super Admin"]))

// CRUD operations for face scanners
router.post("/", createFaceScanner)
router.get("/", getAllFaceScanners)
router.get("/:id", getFaceScannerById)
router.put("/:id", updateFaceScanner)
router.delete("/:id", deleteFaceScanner)
router.post("/:id/regenerate-password", regeneratePassword)

export default router
