import express from "express"
import { getUnits, getRoomsByUnit, allocateRoom, updateRoomStatus, deleteAllocation, getRoomChangeRequests, getRoomChangeRequestById } from "../controllers/hostelController.js"

import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.get("/units/:hostelId", getUnits)
router.get("/rooms/:unitId", getRoomsByUnit)
router.post("/allocate", allocateRoom)
router.put("/rooms/:roomId/status", updateRoomStatus)
router.delete("/deallocate/:allocationId", deleteAllocation)
router.get("/room-change-requests/:hostelId", getRoomChangeRequests)
router.get("/room-change-request/:requestId", getRoomChangeRequestById)

export default router
