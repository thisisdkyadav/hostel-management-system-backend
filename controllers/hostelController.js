import Hostel from "../models/Hostel.js"
import Room from "../models/Room.js"
import Unit from "../models/Unit.js"
import Complaint from "../models/Complaint.js"
import RoomAllocation from "../models/RoomAllocation.js"
import RoomChangeRequest from "../models/RoomChangeRequest.js"
import mongoose from "mongoose"

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
    const hostelsData = await Hostel.find()

    console.log("Hostels Data:", hostelsData)

    const hostels = []

    for (const hostel of hostelsData) {
      const rooms = await Room.find({ hostelId: hostel._id })

      const totalRooms = rooms.length
      const occupiedRooms = rooms.filter((room) => room.occupancy > 0).length
      const vacantRooms = rooms.filter((room) => room.occupancy === 0).length

      const capacity = rooms.reduce((sum, room) => sum + room.capacity, 0)
      const currentOccupancy = rooms.reduce((sum, room) => sum + room.occupancy, 0)
      const occupancyRate = totalRooms > 0 ? Math.round((currentOccupancy / capacity) * 100) : 0

      const maintenanceIssues = await Complaint.countDocuments({
        hostelId: hostel._id,
        status: { $in: ["Pending", "In Progress"] },
        complaintType: { $in: ["Electricity", "Water", "Civil", "Other"] },
      })

      hostels.push({
        id: hostel._id,
        name: hostel.name,
        type: hostel.type,
        gender: hostel.gender,
        location: hostel.location,
        totalRooms: totalRooms,
        occupiedRooms: occupiedRooms,
        vacantRooms: vacantRooms,
        maintenanceIssues: maintenanceIssues,
        capacity: capacity,
        occupancyRate: occupancyRate,
      })
    }

    console.log("Formatted Hostels Data:", hostels)

    res.status(200).json(hostels)
  } catch (error) {
    res.status(500).json({ message: "Error fetching hostels", error: error.message })
  }
}

export const updateHostel = async (req, res) => {
  console.log("Request Body:", req.body)

  const { id } = req.params
  const { name, gender, location } = req.body
  try {
    const updatedHostel = await Hostel.findByIdAndUpdate(id, { name, gender, location }, { new: true })
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
            select: "name email",
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
          select: "name email",
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
  console.log("Request Body:", req.body)

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
    console.log("Updated Room:", updatedRoom)

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
    console.log("Room allocation request:", req.body)

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

  console.log("Query Parameters:", req.query)

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
