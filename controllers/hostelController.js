import Hostel from "../models/Hostel.js"
import Room from "../models/Room.js"
import Unit from "../models/Unit.js"
import Complaint from "../models/Complaint.js"
import RoomAllocation from "../models/RoomAllocation.js"
import RoomChangeRequest from "../models/RoomChangeRequest.js"
import mongoose from "mongoose"

async function createUnits(hostelId, units, session) {
  const createdUnits = {}
  if (Array.isArray(units)) {
    const unitsToInsert = units
      .filter((unitData) => unitData.unitNumber)
      .map((unitData) => {
        const { unitNumber, floor, commonAreaDetails } = unitData
        return {
          hostelId,
          unitNumber,
          floor: floor || parseInt(unitNumber.charAt(0)) - 1 || 0,
          commonAreaDetails: commonAreaDetails || "",
        }
      })

    if (unitsToInsert.length > 0) {
      const savedUnits = await Unit.insertMany(unitsToInsert, { session })
      savedUnits.forEach((unit) => {
        createdUnits[unit.unitNumber] = unit._id
      })
    }
  }
  return createdUnits
}

async function createRooms(hostelId, rooms, createdUnits, type, session) {
  if (Array.isArray(rooms)) {
    for (const roomData of rooms) {
      const { unitNumber, roomNumber, capacity, status } = roomData
      if (!roomNumber || !capacity) {
        continue
      }
      const roomFields = {
        hostelId,
        roomNumber,
        capacity,
        status: status || "Active",
        occupancy: 0,
      }
      if (type === "unit-based" && unitNumber && createdUnits[unitNumber]) {
        roomFields.unitId = createdUnits[unitNumber]
      }
      const room = new Room(roomFields)
      await room.save({ session })
    }
  }
}

export const addHostel = async (req, res) => {
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const { name, gender, type, units, rooms } = req.body

    if (!name || !gender || !type) {
      return res.status(400).json({ message: "Missing required hostel information" })
    }

    const newHostel = new Hostel({
      name,
      gender,
      type,
    })

    const savedHostel = await newHostel.save({ session })
    const hostelId = savedHostel._id

    const createdUnits = {}
    if (type === "unit-based" && Array.isArray(units)) {
      for (const unitData of units) {
        const { unitNumber, floor, commonAreaDetails } = unitData

        if (!unitNumber) {
          continue
        }

        const unit = new Unit({
          hostelId,
          unitNumber,
          floor: floor || 0,
          commonAreaDetails: commonAreaDetails || "",
        })

        const savedUnit = await unit.save({ session })
        createdUnits[unitNumber] = savedUnit._id
      }
    }

    if (Array.isArray(rooms)) {
      for (const roomData of rooms) {
        const { unitNumber, roomNumber, capacity } = roomData

        if (!roomNumber || !capacity) {
          continue
        }

        const roomFields = {
          hostelId,
          roomNumber,
          capacity,
          status: "Active",
          occupancy: 0,
        }

        if (type === "unit-based" && unitNumber && createdUnits[unitNumber]) {
          roomFields.unitId = createdUnits[unitNumber]
        }

        const room = new Room(roomFields)
        await room.save({ session })
      }
    }

    await session.commitTransaction()
    session.endSession()

    const totalRooms = Array.isArray(rooms) ? rooms.length : 0

    res.status(201).json({
      message: "Hostel added successfully",
      data: {
        id: hostelId,
        name,
        gender,
        type,
        totalUnits: Object.keys(createdUnits).length,
        totalRooms,
      },
      success: true,
    })
  } catch (error) {
    await session.abortTransaction()
    session.endSession()

    if (error.code === 11000) {
      if (error.keyPattern?.name) {
        return res.status(400).json({ message: "A hostel with this name already exists" })
      }
      if (error.keyPattern?.["hostelId"] && error.keyPattern?.["unitNumber"]) {
        return res.status(400).json({ message: "Duplicate unit number in this hostel" })
      }
      if (error.keyPattern?.["hostelId"] && error.keyPattern?.["unitId"] && error.keyPattern?.["roomNumber"]) {
        return res.status(400).json({ message: "Duplicate room number in this unit/hostel" })
      }
    }

    res.status(500).json({ message: "Error adding hostel", error: error.message })
  }
}

export const getHostels = async (req, res) => {
  try {
    const hostels = await Hostel.find({}, { _id: 1, name: 1, type: 1, gender: 1 })

    const hostelDataPromises = hostels.map(async (hostel) => {
      const [roomStats, maintenanceIssues] = await Promise.all([
        Room.aggregate([
          { $match: { hostelId: hostel._id } },
          {
            $group: {
              _id: null,
              totalRooms: { $sum: 1 },
              occupiedRoomsCount: {
                $sum: { $cond: [{ $gt: ["$occupancy", 0] }, 1, 0] },
              },
              vacantRoomsCount: {
                $sum: { $cond: [{ $eq: ["$occupancy", 0] }, 1, 0] },
              },
              totalCapacity: { $sum: "$capacity" },
              totalOccupancy: { $sum: "$occupancy" },
            },
          },
        ]),
        Complaint.countDocuments({
          hostelId: hostel._id,
          status: { $in: ["Pending", "In Progress"] },
        }),
      ])

      let stats = {
        totalRooms: 0,
        occupiedRooms: 0,
        vacantRooms: 0,
        capacity: 0,
        occupancyRate: 0,
      }

      if (roomStats.length > 0) {
        const { totalRooms, occupiedRoomsCount, vacantRoomsCount, totalCapacity, totalOccupancy } = roomStats[0]
        stats = {
          totalRooms,
          occupiedRooms: occupiedRoomsCount,
          vacantRooms: vacantRoomsCount,
          capacity: totalCapacity,
          occupancyRate: totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0,
        }
      }

      return {
        id: hostel._id,
        name: hostel.name,
        type: hostel.type,
        gender: hostel.gender,
        totalRooms: stats.totalRooms,
        occupiedRooms: stats.occupiedRooms,
        vacantRooms: stats.vacantRooms,
        maintenanceIssues,
        capacity: stats.capacity,
        occupancyRate: stats.occupancyRate,
      }
    })

    const result = await Promise.all(hostelDataPromises)

    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ message: "Error fetching hostels", error: error.message })
  }
}

export const updateHostel = async (req, res) => {
  const { id } = req.params
  const { name, gender } = req.body
  try {
    const updatedHostel = await Hostel.findByIdAndUpdate(id, { name, gender }, { new: true })
    if (!updatedHostel) {
      return res.status(404).json({ message: "Hostel not found" })
    }
    res.status(200).json(updatedHostel)
  } catch (error) {
    res.status(500).json({ message: "Error updating hostel", error: error.message })
  }
}

export const getHostelList = async (req, res) => {
  try {
    const hostels = await Hostel.find({}, { _id: 1, name: 1, type: 1 })
    res.status(200).json(hostels)
  } catch (error) {
    res.status(500).json({ message: "Error fetching hostels", error: error.message })
  }
}

export const getUnits = async (req, res) => {
  const user = req.user
  const { hostelId } = req.params
  try {
    if (user.hostel && user.hostel._id.toString() !== hostelId) {
      return res.status(403).json({ message: "You do not have permission to access this hostel" })
    }
    const unitsWithRooms = await Unit.find({ hostelId: hostelId }).populate("hostelId").populate("rooms")

    const finalResult = unitsWithRooms.map((unit) => ({
      id: unit._id,
      unitNumber: unit.unitNumber,
      hostel: unit.hostelId.name,
      floor: unit.floor,
      commonAreaDetails: unit.commonAreaDetails,
      roomCount: unit.roomCount,
      capacity: unit.capacity,
      occupancy: unit.occupancy,
    }))

    res.status(200).json(finalResult)
  } catch (error) {
    res.status(500).json({ message: "Error fetching units", error: error.message })
  }
}

export const getRoomsByUnit = async (req, res) => {
  const user = req.user
  const { unitId } = req.params
  try {
    const roomsWithStudents = await Room.find({ unitId: unitId })
      .populate({
        path: "allocations",
        populate: {
          path: "studentProfileId",
          populate: {
            path: "userId",
            select: "name email profileImage",
          },
        },
      })
      .populate("hostelId", "name type")
      .populate("unitId", "unitNumber floor")

    if (roomsWithStudents.length && user.hostel && user.hostel._id.toString() !== roomsWithStudents[0].hostelId._id.toString()) {
      return res.status(403).json({ message: "You do not have permission to access this unit's rooms" })
    }

    let finalResults = roomsWithStudents.map((room) => ({
      id: room._id,
      unit: room.unitId,
      hostel: room.hostelId,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      currentOccupancy: room.occupancy,
      status: room.status,
      students:
        room.allocations.map((allocation) => ({
          id: allocation.studentProfileId._id,
          name: allocation.studentProfileId.userId.name,
          email: allocation.studentProfileId.userId.email,
          profileImage: allocation.studentProfileId.userId.profileImage,
          rollNumber: allocation.studentProfileId.rollNumber,
          department: allocation.studentProfileId.department,
          bedNumber: allocation.bedNumber,
          allocationId: allocation._id,
        })) || [],
    }))

    res.status(200).json({
      data: finalResults,
      message: "Rooms fetched successfully",
      status: "success",
      meta: {
        total: roomsWithStudents.length,
      },
    })
  } catch (error) {
    res.status(500).json({ message: "Error fetching rooms", error: error.message })
  }
}

export const getRooms = async (req, res) => {
  const user = req.user

  const { hostelId } = req.query
  try {
    if (user.hostel && user.hostel._id.toString() !== hostelId) {
      return res.status(403).json({ message: "You do not have permission to access this hostel's rooms" })
    }

    const roomsWithStudents = await Room.find({ hostelId: hostelId }).populate({
      path: "allocations",
      populate: {
        path: "studentProfileId",
        populate: {
          path: "userId",
          select: "name email profileImage",
        },
      },
    })

    const finalResult = roomsWithStudents.map((room) => ({
      id: room._id,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      currentOccupancy: room.occupancy,
      status: room.status,
      hostel: room.hostelId,
      students:
        room.allocations.map((allocation) => ({
          id: allocation.studentProfileId._id,
          name: allocation.studentProfileId.userId.name,
          email: allocation.studentProfileId.userId.email,
          profileImage: allocation.studentProfileId.userId.profileImage,
          rollNumber: allocation.studentProfileId.rollNumber,
          department: allocation.studentProfileId.department,
          bedNumber: allocation.bedNumber,
          allocationId: allocation._id,
        })) || [],
    }))

    res.status(200).json({
      data: finalResult,
      message: "Rooms fetched successfully",
      status: "success",
      meta: {
        total: roomsWithStudents.length,
      },
    })
  } catch (error) {
    res.status(500).json({ message: "Error fetching rooms", error: error.message })
  }
}

export const updateRoomStatus = async (req, res) => {
  const { roomId } = req.params
  const { status } = req.body
  try {
    let updatedRoom = null

    if (status === "Inactive") {
      updatedRoom = await Room.deactivateRoom(roomId)
    } else if (status === "Active") {
      updatedRoom = await Room.activateRoom(roomId)
    } else {
      return res.status(400).json({ message: "Invalid status value" })
    }

    if (!updatedRoom) {
      return res.status(404).json({ message: "Room not found" })
    }

    if (status === "Inactive") {
      await RoomAllocation.deleteMany({ roomId })
    }
    res.status(200).json({ message: "Room status updated successfully", updatedRoom })
  } catch (error) {
    res.status(500).json({ message: "Error updating room status", error: error.message })
  }
}

export const allocateRoom = async (req, res) => {
  const { roomId, hostelId, unitId, studentId, bedNumber, userId } = req.body
  try {
    if (!roomId || !hostelId || !studentId || !bedNumber || !userId) {
      return res.status(400).json({ message: "Missing required fields" })
    }

    const hostel = await Hostel.findById(hostelId)
    if (!hostel) {
      return res.status(404).json({ message: "Hostel not found" })
    }

    if (hostel.type === "unit-based" && !unitId) {
      return res.status(400).json({ message: "Unit ID is required for unit-based hostels" })
    }

    const room = await Room.findById(roomId)
    if (!room) {
      return res.status(404).json({ message: "Room not found" })
    }

    if (room.status !== "Active") {
      return res.status(400).json({ message: "Cannot allocate an inactive room" })
    }

    if (room.occupancy >= room.capacity) {
      return res.status(400).json({ message: "Room is already at full capacity" })
    }

    if (bedNumber <= 0 || bedNumber > room.capacity) {
      return res.status(400).json({
        message: `Invalid bed number. Must be between 1 and ${room.capacity}`,
      })
    }

    const existingBedAllocation = await RoomAllocation.findOne({
      roomId,
      bedNumber,
    })

    if (existingBedAllocation) {
      return res.status(400).json({ message: "The selected bed is already occupied" })
    }

    const existingAllocation = await RoomAllocation.findOne({
      studentProfileId: studentId,
    })

    if (existingAllocation) {
      return res.status(400).json({
        message: "Student already has a room allocation. Please deallocate first.",
      })
    }

    const allocationData = {
      userId,
      roomId,
      hostelId,
      studentProfileId: studentId,
      bedNumber,
    }

    if (hostel.type === "unit-based") {
      allocationData.unitId = unitId
    }

    const newAllocation = new RoomAllocation(allocationData)
    await newAllocation.save()

    res.status(200).json({
      message: "Room allocated successfully",
      success: true,
      allocation: newAllocation,
    })
  } catch (error) {
    console.error("Room allocation error:", error)
    res.status(500).json({ message: "Error allocating room", error: error.message })
  }
}

export const deleteAllocation = async (req, res) => {
  const { allocationId } = req.params
  try {
    const allocation = await RoomAllocation.findByIdAndDelete(allocationId)
    if (!allocation) {
      return res.status(404).json({ message: "Allocation not found" })
    }
    res.status(200).json({ message: "Room allocation deleted successfully", success: true })
  } catch (error) {
    res.status(500).json({ message: "Error deallocating room", error: error.message })
  }
}

export const getRoomChangeRequests = async (req, res) => {
  const { hostelId } = req.params
  const { page = 1, limit = 10, status = "Pending" } = req.query

  try {
    const result = await RoomChangeRequest.findRequestsWithFilters(hostelId, {
      page,
      limit,
      status,
    })

    res.status(200).json({
      data: result.data,
      meta: result.meta,
      message: "Room change requests fetched successfully",
      status: "success",
    })
  } catch (error) {
    console.error("Error fetching room change requests:", error)
    res.status(500).json({ message: "Error fetching room change requests", error: error.message })
  }
}

export const getRoomChangeRequestById = async (req, res) => {
  const { requestId } = req.params
  try {
    const roomChangeRequest = await RoomChangeRequest.findById(requestId)
      .populate("userId", "name email")
      .populate("studentProfileId", "rollNumber department")
      .populate({
        path: "currentAllocationId",
        populate: {
          path: "room",
          populate: { path: "unitId" },
        },
      })
      .populate("requestedRoomId")
      .populate("requestedUnitId")

    const requestedRoom = await Room.findById(roomChangeRequest.requestedRoomId._id).populate({
      path: "allocations",
      populate: {
        path: "studentProfileId",
        populate: {
          path: "userId",
          select: "name email",
        },
      },
    })

    if (!roomChangeRequest) {
      return res.status(404).json({ message: "Room change request not found" })
    }

    const finalResult = {
      id: roomChangeRequest._id,
      student: {
        name: roomChangeRequest.userId.name,
        email: roomChangeRequest.userId.email,
        rollNumber: roomChangeRequest.studentProfileId.rollNumber,
      },
      currentAllocationId: roomChangeRequest.currentAllocationId,
      currentRoom: {
        roomNumber: roomChangeRequest.currentAllocationId && roomChangeRequest.currentAllocationId.room ? roomChangeRequest.currentAllocationId.room.roomNumber : null,
        unitNumber: roomChangeRequest.currentAllocationId && roomChangeRequest.currentAllocationId.room ? roomChangeRequest.currentAllocationId.room.unitId.unitNumber : null,
      },
      requestedRoom: {
        roomId: roomChangeRequest.requestedRoomId ? roomChangeRequest.requestedRoomId.roomNumber : null,
        roomNumber: roomChangeRequest.requestedRoomId ? roomChangeRequest.requestedRoomId.roomNumber : null,
        unitId: roomChangeRequest.requestedUnitId ? roomChangeRequest.requestedUnitId.unitNumber : null,
        unitNumber: roomChangeRequest.requestedUnitId ? roomChangeRequest.requestedUnitId.unitNumber : null,
        capacity: roomChangeRequest.requestedRoomId ? roomChangeRequest.requestedRoomId.capacity : null,
        occupancy: roomChangeRequest.requestedRoomId ? roomChangeRequest.requestedRoomId.occupancy : null,
        students:
          requestedRoom.allocations.map((allocation) => ({
            id: allocation.studentProfileId._id,
            name: allocation.studentProfileId.userId.name,
            email: allocation.studentProfileId.userId.email,
            rollNumber: allocation.studentProfileId.rollNumber,
            department: allocation.studentProfileId.department,
            bedNumber: allocation.bedNumber,
            allocationId: allocation._id,
          })) || [],
      },
      reason: roomChangeRequest.reason,
      status: roomChangeRequest.status,
      createdAt: roomChangeRequest.createdAt,
      rejectionReason: roomChangeRequest.rejectionReason,
    }

    res.status(200).json(finalResult)
  } catch (error) {
    console.error("Error fetching room change request:", error)
    res.status(500).json({ message: "Error fetching room change request", error: error.message })
  }
}

export const approveRoomChangeRequest = async (req, res) => {
  const { requestId } = req.params
  const { bedNumber } = req.body

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    const request = await RoomChangeRequest.findById(requestId).populate("currentAllocationId").session(session)

    if (!request) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ message: "Room change request not found", success: false })
    }

    if (request.status !== "Pending") {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({
        message: "This request has already been processed",
        success: false,
        status: request.status,
      })
    }

    const requestedRoom = await Room.findById(request.requestedRoomId).session(session)

    if (!requestedRoom) {
      await session.abortTransaction()
      session.endSession()
      return res.status(404).json({ message: "Requested room not found", success: false })
    }

    if (requestedRoom.occupancy >= requestedRoom.capacity) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ message: "Requested room is at full capacity", success: false })
    }

    if (!bedNumber) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ message: "Bed number is required", success: false })
    }

    const existingBedAllocation = await RoomAllocation.findOne({
      roomId: request.requestedRoomId,
      bedNumber: bedNumber,
    }).session(session)

    if (existingBedAllocation) {
      await session.abortTransaction()
      session.endSession()
      return res.status(400).json({ message: "The requested bed is already occupied", success: false })
    }

    const updatedAllocation = await RoomAllocation.findByIdAndUpdate(
      request.currentAllocationId._id,
      {
        roomId: request.requestedRoomId,
        bedNumber: bedNumber,
      },
      { new: true, session }
    )

    if (!updatedAllocation) {
      await session.abortTransaction()
      session.endSession()
      return res.status(500).json({ message: "Failed to update room allocation", success: false })
    }

    request.status = "Approved"
    request.newAllocationId = updatedAllocation._id
    await request.save({ session })

    await session.commitTransaction()
    session.endSession()

    res.status(200).json({
      message: "Room change request approved successfully",
      success: true,
      data: {
        requestId: request._id,
        student: request.studentProfileId,
        newRoom: {
          roomId: requestedRoom._id,
          roomNumber: requestedRoom.roomNumber,
          bedNumber: bedNumber,
        },
        status: "Approved",
      },
    })
  } catch (error) {
    // Rollback in case of error
    await session.abortTransaction()
    session.endSession()

    console.error("Error approving room change request:", error)
    res.status(500).json({
      message: "Error approving room change request",
      success: false,
      error: error.message,
    })
  }
}

export const rejectRoomChangeRequest = async (req, res) => {
  const { requestId } = req.params
  const { reason } = req.body

  try {
    const request = await RoomChangeRequest.findById(requestId)

    if (!request) {
      return res.status(404).json({ message: "Room change request not found", success: false })
    }

    if (request.status !== "Pending") {
      return res.status(400).json({
        message: "This request has already been processed",
        success: false,
        status: request.status,
      })
    }

    request.status = "Rejected"
    request.rejectionReason = reason

    await request.save()

    res.status(200).json({
      message: "Room change request rejected successfully",
      success: true,
      data: {
        requestId: request._id,
        student: request.studentProfileId,
        status: "Rejected",
        rejectionReason: reason,
      },
    })
  } catch (error) {
    console.error("Error rejecting room change request:", error)
    res.status(500).json({
      message: "Error rejecting room change request",
      error: error.message,
    })
  }
}

export const getRoomsForEdit = async (req, res) => {
  const { hostelId } = req.params
  try {
    const rooms = await Room.find({ hostelId: hostelId }).populate("unitId")

    const finalResult = rooms.map((room) => ({
      id: room._id,
      unitNumber: room.unitId ? room.unitId.unitNumber : null,
      roomNumber: room.roomNumber,
      capacity: room.capacity,
      status: room.status,
    }))
    res.status(200).json({
      message: "Rooms fetched successfully",
      success: true,
      meta: {
        total: rooms.length,
      },
      data: finalResult,
    })
  } catch (error) {
    console.error("Error fetching room details:", error)
    res.status(500).json({ message: "Error fetching room details", error: error.message })
  }
}

export const updateRoom = async (req, res) => {
  const { roomId } = req.params
  const { capacity, status } = req.body

  try {
    const updatedRoom = await Room.findByIdAndUpdate(
      roomId,
      {
        capacity,
        status,
      },
      { new: true }
    )

    if (!updatedRoom) {
      return res.status(404).json({ message: "Room not found" })
    }

    res.status(200).json({
      message: "Room updated successfully",
      success: true,
      data: updatedRoom,
    })
  } catch (error) {
    console.error("Error updating room:", error)
    res.status(500).json({ message: "Error updating room", error: error.message })
  }
}

export const addRooms = async (req, res) => {
  const { hostelId } = req.params
  const { rooms, units } = req.body

  try {
    const hostel = await Hostel.findById(hostelId)
    if (!hostel) {
      return res.status(404).json({ message: "Hostel not found" })
    }

    const uniqueUnits = [...new Set(units)]
    const createdUnits = await createUnits(hostelId, uniqueUnits)

    console.log("Created Units:", createdUnits)

    await createRooms(hostelId, rooms, createdUnits, hostel.type)

    console.log("Rooms added successfully for hostel:", hostelId)

    res.status(200).json({ message: "Rooms added successfully", success: true })
  } catch (error) {
    console.error("Error adding room:", error)
    res.status(500).json({ message: "Error adding room", error: error.message })
  }
}

export const bulkUpdateRooms = async (req, res) => {
  const { hostelId } = req.params
  const { rooms } = req.body

  try {
    const hostel = await Hostel.findById(hostelId)
    if (!hostel) {
      return res.status(404).json({ message: "Hostel not found" })
    }

    const uniqueUnits = [...new Set(rooms.map((room) => room.unitNumber))]
    console.log("Unique Units:", uniqueUnits)
    const units = await Unit.find({ hostelId, unitNumber: { $in: uniqueUnits } })
    if (!units) {
      return res.status(404).json({ message: "Units not found" })
    }

    const unitMap = {}
    units.forEach((unit) => {
      unitMap[unit.unitNumber] = unit._id
    })

    const roomsToUpdate = rooms.map((room) => room.roomNumber)
    const existingRooms = await Room.find({
      hostelId,
      roomNumber: { $in: roomsToUpdate },
      unitId: { $in: Object.values(unitMap) },
    }).populate("unitId", "unitNumber")

    const filteredExistingRooms = existingRooms.filter((room) => rooms.some((r) => r.roomNumber === room.roomNumber && r.unitNumber === room.unitId.unitNumber))

    // Group rooms into categories
    const roomsToActivate = []
    const roomsToDeactivate = []
    const roomsToUpdateCapacity = []

    uniqueUnits.forEach((unitNumber) => {
      const roomsInUnit = filteredExistingRooms.filter((room) => room.unitId.unitNumber === unitNumber)
      roomsInUnit.forEach((room) => {
        const roomData = rooms.find((r) => r.roomNumber === room.roomNumber && r.unitNumber === room.unitId.unitNumber)
        if (roomData) {
          // Status change
          if (roomData.status && room.status !== roomData.status) {
            if (roomData.status === "Active") {
              roomsToActivate.push(room._id)
            } else if (roomData.status === "Inactive") {
              roomsToDeactivate.push(room._id)
            }
          }
          // Capacity change (only for active rooms)
          else if (room.status === "Active" && roomData.capacity && room.capacity !== roomData.capacity) {
            roomsToUpdateCapacity.push({
              roomId: room._id,
              capacity: roomData.capacity,
            })
          }
        }
      })
    })

    // No rooms to update
    if (roomsToActivate.length === 0 && roomsToDeactivate.length === 0 && roomsToUpdateCapacity.length === 0) {
      return res.status(200).json({
        message: "No rooms to update",
        success: true,
      })
    }

    const updatedRoomIds = []

    // Process activations
    if (roomsToActivate.length > 0) {
      const activatedRooms = await Room.activateRooms(roomsToActivate)
      updatedRoomIds.push(...activatedRooms.map((room) => room._id))
    }

    // Process deactivations
    if (roomsToDeactivate.length > 0) {
      const deactivatedRooms = await Room.deactivateRooms(roomsToDeactivate)
      updatedRoomIds.push(...deactivatedRooms.map((room) => room._id))
    }

    // Process capacity updates for rooms that don't change status
    if (roomsToUpdateCapacity.length > 0) {
      const bulkOps = roomsToUpdateCapacity.map((room) => ({
        updateOne: {
          filter: { _id: room.roomId },
          update: { capacity: room.capacity },
        },
      }))
      await Room.bulkWrite(bulkOps)
      updatedRoomIds.push(...roomsToUpdateCapacity.map((room) => room.roomId))
    }

    // Clean up allocations for deactivated rooms
    if (roomsToDeactivate.length > 0) {
      await RoomAllocation.deleteMany({ roomId: { $in: roomsToDeactivate } })
    }

    res.status(200).json({
      message: "Rooms updated successfully",
      success: true,
      updatedRoomIds,
    })
  } catch (error) {
    console.error("Error updating rooms:", error)
    res.status(500).json({ message: "Error updating rooms", error: error.message })
  }
}
