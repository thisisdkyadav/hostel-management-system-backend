import express from "express"
import { getRooms, getUnits, getRoomsByUnit, allocateRoom, updateRoomStatus, deleteAllocation, getRoomChangeRequests, getRoomChangeRequestById, approveRoomChangeRequest, rejectRoomChangeRequest } from "../controllers/hostelController.js"

import { authenticate } from "../middlewares/auth.js"

const router = express.Router()
router.use(authenticate)

router.get("/units/:hostelId", getUnits)
router.get("/rooms/:unitId", getRoomsByUnit)
router.get("/rooms-room-only", getRooms)
router.post("/allocate", allocateRoom)
router.put("/rooms/:roomId/status", updateRoomStatus)
router.delete("/deallocate/:allocationId", deleteAllocation)
router.get("/room-change-requests/:hostelId", getRoomChangeRequests)
router.get("/room-change-request/:requestId", getRoomChangeRequestById)
router.put("/room-change-request/approve/:requestId", approveRoomChangeRequest)
router.put("/room-change-request/reject/:requestId", rejectRoomChangeRequest)

export default router
