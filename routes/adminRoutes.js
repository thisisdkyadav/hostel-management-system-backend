import express from "express"
import { addHostel, getHostels, getHostelList, updateHostel } from "../controllers/hostelController.js"
import { createSecurity, getAllSecurities, updateSecurity, updateUserPassword, deleteSecurity, createMaintenanceStaff, getAllMaintenanceStaff, updateMaintenanceStaff, deleteMaintenanceStaff, getTaskStats, getMaintenanceStaffStats } from "../controllers/adminController.js"
import { createWarden, getAllWardens, updateWarden, deleteWarden } from "../controllers/wardenController.js"
import { createAssociateWarden, getAllAssociateWardens, updateAssociateWarden, deleteAssociateWarden } from "../controllers/associateWardenController.js"
import { createHostelSupervisor, getAllHostelSupervisors, updateHostelSupervisor, deleteHostelSupervisor } from "../controllers/hostelSupervisorController.js"
import { getInsuranceProviders, createInsuranceProvider, updateInsuranceProvider, deleteInsuranceProvider, updateBulkStudentInsurance } from "../controllers/insuranceProviderController.js"
import { getHealth, updateHealth, createInsuranceClaim, getInsuranceClaims, updateInsuranceClaim, deleteInsuranceClaim, updateBulkStudentHealth } from "../controllers/healthController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"
import { createHostelGate, getAllHostelGates, updateHostelGate, deleteHostelGate } from "../controllers/hostelGateController.js"
const router = express.Router()
router.use(authenticate)
router.get("/hostel/list", getHostelList)
router.use(authorizeRoles(["Admin"]))

router.get("/hostels", getHostels)

router.post("/hostel", addHostel)
router.put("/hostel/:id", updateHostel)

router.get("/wardens", getAllWardens)
router.post("/warden", createWarden)
router.put("/warden/:id", updateWarden)
router.delete("/warden/:id", deleteWarden)

router.get("/associate-wardens", getAllAssociateWardens)
router.post("/associate-warden", createAssociateWarden)
router.put("/associate-warden/:id", updateAssociateWarden)
router.delete("/associate-warden/:id", deleteAssociateWarden)

router.get("/hostel-supervisors", getAllHostelSupervisors)
router.post("/hostel-supervisor", createHostelSupervisor)
router.put("/hostel-supervisor/:id", updateHostelSupervisor)
router.delete("/hostel-supervisor/:id", deleteHostelSupervisor)

router.get("/security", getAllSecurities)
router.post("/security", createSecurity)
router.put("/security/:id", updateSecurity)
router.delete("/security/:id", deleteSecurity)

router.get("/maintenance", getAllMaintenanceStaff)
router.post("/maintenance", createMaintenanceStaff)
router.put("/maintenance/:id", updateMaintenanceStaff)
router.delete("/maintenance/:id", deleteMaintenanceStaff)

router.get("/maintenance-staff-stats/:staffId", getMaintenanceStaffStats)

router.get("/insurance-providers", getInsuranceProviders)
router.post("/insurance-providers", createInsuranceProvider)
router.put("/insurance-providers/:id", updateInsuranceProvider)
router.delete("/insurance-providers/:id", deleteInsuranceProvider)
router.post("/insurance-providers/bulk-student-update", updateBulkStudentInsurance)

router.get("/student/health/:userId", getHealth)
router.put("/student/health/:userId", updateHealth)
router.post("/student/health/bulk-update", updateBulkStudentHealth)

router.post("/insurance-claims", createInsuranceClaim)
router.get("/insurance-claims/:userId", getInsuranceClaims)
router.put("/insurance-claims/:id", updateInsuranceClaim)
router.delete("/insurance-claims/:id", deleteInsuranceClaim)

router.post("/hostel-gate", createHostelGate)
router.get("/hostel-gate/all", getAllHostelGates)
router.put("/hostel-gate/:hostelId", updateHostelGate)
router.delete("/hostel-gate/:hostelId", deleteHostelGate)

router.post("/user/update-password", updateUserPassword)

router.get("/task-stats", getTaskStats)

export default router
