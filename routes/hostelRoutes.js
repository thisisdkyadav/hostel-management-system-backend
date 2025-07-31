import express from "express"
import { getRooms, getRoomsForEdit, bulkUpdateRooms, addRooms, updateRoom, getUnits, getRoomsByUnit, allocateRoom, updateRoomStatus, deleteAllocation, changeArchiveStatus, deleteAllAllocations } from "../controllers/hostelController.js"

import { authenticate } from "../middlewares/auth.js"
import { updateRoomAllocations } from "../controllers/studentController.js"
import { authorizeRoles } from "../middlewares/authorize.js"

const router = express.Router()
router.use(authenticate)

router.get("/units/:hostelId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getUnits)
router.get("/rooms/:unitId", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getRoomsByUnit)
router.get("/rooms-room-only", authorizeRoles(["Admin", "Warden", "Associate Warden", "Hostel Supervisor"]), getRooms)
router.use(authorizeRoles(["Admin"]))
router.post("/allocate", allocateRoom)
router.get("/rooms/:hostelId/edit", getRoomsForEdit)
router.post("/rooms/:hostelId/add", addRooms)
router.put("/rooms/status/:roomId", updateRoomStatus)
router.put("/rooms/:hostelId/bulk-update", bulkUpdateRooms)
router.put("/rooms/:hostelId/:roomId", updateRoom)
router.delete("/deallocate/:allocationId", deleteAllocation)
router.put("/archive/:hostelId", changeArchiveStatus)

router.put("/update-allocations/:hostelId", updateRoomAllocations)
router.delete("/delete-all-allocations/:hostelId", deleteAllAllocations)

export default router
