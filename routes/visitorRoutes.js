import express from "express"
import { createVisitorRequest, deleteVisitorRequest, getVisitorRequests, updateVisitorRequest, updateVisitorRequestStatus, allocateRoomsToVisitorRequest, getVisitorRequestById, checkInVisitor, checkOutVisitor, updateCheckTime, getStudentVisitorRequests } from "../controllers/visitorController.js"
import { getVisitorProfiles, createVisitorProfile, deleteVisitorProfile, updateVisitorProfile } from "../controllers/visitorProfileController.js"
import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.get("/requests/summary", getVisitorRequests)
router.get("/requests/student/:userId", getStudentVisitorRequests)
router.get("/requests/:requestId", getVisitorRequestById)
router.post("/requests", createVisitorRequest)
router.put("/requests/:requestId", updateVisitorRequest)
router.delete("/requests/:requestId", deleteVisitorRequest)
router.get("/profiles", getVisitorProfiles)
router.post("/profiles", createVisitorProfile)
router.put("/profiles/:visitorId", updateVisitorProfile)
router.delete("/profiles/:visitorId", deleteVisitorProfile)
router.post("/requests/:requestId/allocate", allocateRoomsToVisitorRequest)
router.post("/requests/:requestId/checkin", checkInVisitor)
router.post("/requests/:requestId/checkout", checkOutVisitor)
router.put("/requests/:requestId/update-check-times", updateCheckTime)
router.post("/requests/:requestId/:action", updateVisitorRequestStatus)

export default router
