import express from "express"
import { addCertificate, getCertificatesByStudent, updateCertificate, deleteCertificate } from "../controllers/certificateController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { requirePermission } from "../utils/permissions.js"

const router = express.Router()
router.use(authenticate)

router.post("/add", authorizeRoles(["Admin"]), addCertificate)
router.get("/:studentId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), requirePermission("students_info", "view"), getCertificatesByStudent)
router.put("/update/:certificateId", authorizeRoles(["Admin"]), updateCertificate)
router.delete("/:certificateId", authorizeRoles(["Admin"]), deleteCertificate)

export default router
