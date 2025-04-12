import express from "express"
import apiAuth from "./middleware/apiAuth.js"
import wardenRoutes from "./routes/wardenRoutes.js"
import complaintRoutes from "./routes/complaintRoutes.js"
import securityRoutes from "./routes/securityRoutes.js"
import lostAndFoundRoutes from "./routes/lostAndFoundRoutes.js"
import maintenanceStaffRoutes from "./routes/maintenanceStaffRoutes.js"
import unitRoutes from "./routes/unitRoutes.js"
import associateWardenRoutes from "./routes/associateWardenRoutes.js"
import hostelRoutes from "./routes/hostelRoutes.js"
import feedbackRoutes from "./routes/feedbackRoutes.js"
import visitorRequestRoutes from "./routes/visitorRequestRoutes.js"
import discoActionRoutes from "./routes/discoActionRoutes.js"
import roomRoutes from "./routes/roomRoutes.js"
import eventRoutes from "./routes/eventRoutes.js"
import roomAllocationRoutes from "./routes/roomAllocationRoutes.js"
import notificationRoutes from "./routes/notificationRoutes.js"
import studentProfileRoutes from "./routes/studentProfileRoutes.js"
import userRoutes from "./routes/userRoutes.js"

const router = express.Router()

router.use(apiAuth)

router.use("/warden", wardenRoutes)
router.use("/complaint", complaintRoutes)
router.use("/security", securityRoutes)
router.use("/lostAndFound", lostAndFoundRoutes)
router.use("/maintenanceStaff", maintenanceStaffRoutes)
router.use("/unit", unitRoutes)
router.use("/associateWarden", associateWardenRoutes)
router.use("/hostel", hostelRoutes)
router.use("/feedback", feedbackRoutes)
router.use("/visitorRequest", visitorRequestRoutes)
router.use("/discoAction", discoActionRoutes)
router.use("/room", roomRoutes)
router.use("/event", eventRoutes)
router.use("/roomAllocation", roomAllocationRoutes)
router.use("/notification", notificationRoutes)
router.use("/studentProfile", studentProfileRoutes)
router.use("/user", userRoutes)

export default router
