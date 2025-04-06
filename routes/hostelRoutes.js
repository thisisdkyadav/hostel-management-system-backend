import express from "express"
import { getRooms, getRoomsForEdit, bulkUpdateRooms, addRooms, updateRoom, getUnits, getRoomsByUnit, allocateRoom, updateRoomStatus, deleteAllocation, getRoomChangeRequests, getRoomChangeRequestById, approveRoomChangeRequest, rejectRoomChangeRequest } from "../controllers/hostelController.js"

import { authenticate } from "../middlewares/auth.js"
import { updateRoomAllocations } from "../controllers/studentController.js"

const router = express.Router()
router.use(authenticate)

router.get("/units/:hostelId", getUnits)
router.get("/rooms/:unitId", getRoomsByUnit)
router.get("/rooms-room-only", getRooms)
router.post("/allocate", allocateRoom)
router.get("/rooms/:hostelId/edit", getRoomsForEdit)
router.post("/rooms/:hostelId/add", addRooms)
router.put("/rooms/:hostelId/bulk-update", bulkUpdateRooms)
router.put("/rooms/:hostelId/:roomId", updateRoom)
router.put("/rooms/:roomId/status", updateRoomStatus)
router.delete("/deallocate/:allocationId", deleteAllocation)
router.get("/room-change-requests/:hostelId", getRoomChangeRequests)
router.get("/room-change-request/:requestId", getRoomChangeRequestById)
router.put("/room-change-request/approve/:requestId", approveRoomChangeRequest)
router.put("/room-change-request/reject/:requestId", rejectRoomChangeRequest)

router.put("/update-allocations/:hostelId", updateRoomAllocations)

export default router
