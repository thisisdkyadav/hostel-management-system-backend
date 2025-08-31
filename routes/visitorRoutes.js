import express from "express"
import {
  createVisitorRequest,
  deleteVisitorRequest,
  getVisitorRequests,
  updateVisitorRequest,
  updateVisitorRequestStatus,
  allocateRoomsToVisitorRequest,
  getVisitorRequestById,
  checkInVisitor,
  checkOutVisitor,
  updateCheckTime,
  getStudentVisitorRequests,
  updatePaymentInfo,
} from "../controllers/visitorController.js"
import { getVisitorProfiles, createVisitorProfile, deleteVisitorProfile, updateVisitorProfile } from "../controllers/visitorProfileController.js"
import { authenticate } from "../middlewares/auth.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()
router.use(authenticate)

router.get("/requests/summary", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate", "Student"]), getVisitorRequests)
router.get("/requests/student/:userId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getStudentVisitorRequests)
router.get("/requests/:requestId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor", "Security", "Hostel Gate", "Student"]), getVisitorRequestById)
router.post("/requests", authorizeRoles(["Student"]), createVisitorRequest)
router.put("/requests/:requestId", authorizeRoles(["Student"]), updateVisitorRequest)
router.delete("/requests/:requestId", authorizeRoles(["Student"]), deleteVisitorRequest)
router.get("/profiles", authorizeRoles(["Student"]), getVisitorProfiles)
router.post("/profiles", authorizeRoles(["Student"]), createVisitorProfile)
router.put("/profiles/:visitorId", authorizeRoles(["Student"]), updateVisitorProfile)
router.delete("/profiles/:visitorId", authorizeRoles(["Student"]), deleteVisitorProfile)
router.post("/requests/:requestId/allocate", authorizeRoles(["Warden", "Associate Warden", "Hostel Supervisor"]), allocateRoomsToVisitorRequest)
router.post("/requests/:requestId/checkin", authorizeRoles(["Hostel Gate"]), checkInVisitor)
router.post("/requests/:requestId/checkout", authorizeRoles(["Hostel Gate"]), checkOutVisitor)
router.put("/requests/:requestId/update-check-times", authorizeRoles(["Hostel Gate"]), updateCheckTime)
router.post("/requests/:requestId/:action", authorizeRoles(["Admin"]), updateVisitorRequestStatus)
router.put("/requests/:requestId/payment-info", authorizeRoles(["Student"]), updatePaymentInfo)

export default router
