import Hostel from "../models/Hostel.js"
import Room from "../models/Room.js"
import Unit from "../models/Unit.js"
import Complaint from "../models/Complaint.js"
import Warden from "../models/Warden.js"
import RoomAllocation from "../models/RoomAllocation.js"
import StudentProfile from "../models/StudentProfile.js"
import RoomChangeRequest from "../models/RoomChangeRequest.js"
import { populate } from "dotenv"

export const addHostel = async (req, res) => {
  try {
    const { name, gender, type, location, wardenId, units, rooms } = req.body

    if (!name || !gender || !type) {
      return res.status(400).json({ message: "Missing required hostel information" })
    }

    const newHostel = new Hostel({
      name,
      gender,
      type,
      location: location || "",
    })

    console.log("New Hostel Data:", newHostel)

    const savedHostel = await newHostel.save()
    const hostelId = savedHostel._id

    console.log("Hostel ID:", hostelId)

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

        const savedUnit = await unit.save()
        createdUnits[unitNumber] = savedUnit._id
      }
    }

    console.log("Created Units:", createdUnits)

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
          status: status || "Available",
          occupancy: 0,
        }

        if (type === "unit-based" && unitNumber && createdUnits[unitNumber]) {
          roomFields.unitId = createdUnits[unitNumber]
        }

        const room = new Room(roomFields)
        await room.save()
      }
    }

    const totalRooms = Array.isArray(rooms) ? rooms.length : 0

    res.status(201).json({
      message: "Hostel added successfully",
      hostel: {
        id: hostelId,
        name,
        gender,
        type,
        location: location || "",
        totalUnits: Object.keys(createdUnits).length,
        totalRooms,
      },
    })
  } catch (error) {
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
      const occupiedRooms = rooms.filter((room) => room.status === "Occupied").length
      const vacantRooms = rooms.filter((room) => room.status === "Available").length

      const capacity = rooms.reduce((sum, room) => sum + room.capacity, 0)
      const currentOccupancy = rooms.reduce((sum, room) => sum + room.occupancy, 0)
      const occupancyRate = totalRooms > 0 ? Math.round((currentOccupancy / capacity) * 100) : 0

      console.log("Hostel:", hostel.name)

      const maintenanceIssues = await Complaint.countDocuments({
        hostelId: hostel._id,
        status: { $in: ["Pending", "In Progress"] },
        complaintType: { $in: ["Electricity", "Water", "Civil", "Other"] },
      })

      console.log("Maintenance Issues:", maintenanceIssues)

      const wardenDocs = await Warden.find({ hostelId: hostel._id }).populate("userId")
      const wardens = wardenDocs.map((warden) => warden.userId.name || `Warden ID: ${warden.userId._id}`)

      console.log("Wardens:", wardens)

      hostels.push({
        id: hostel._id,
        name: hostel.name,
        type: hostel.type,
        gender: hostel.gender,
        wardens: wardens,
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
  const { id } = req.params
  const { name, type, gender, location } = req.body
  try {
    const updatedHostel = await Hostel.findByIdAndUpdate(id, { name, type, gender, location }, { new: true })
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
    const hostels = await Hostel.find({}, { _id: 1, name: 1 })
    res.status(200).json(hostels)
  } catch (error) {
    res.status(500).json({ message: "Error fetching hostels", error: error.message })
  }
}

export const getUnits = async (req, res) => {
  const { hostelId } = req.params
  try {
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

    console.log("Rooms with Students Data:", roomsWithStudents[0].allocations)

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

export const updateRoomStatus = async (req, res) => {
  const { roomId } = req.params
  const { status } = req.body
  try {
    const updatedRoom = await Room.findByIdAndUpdate(roomId, { status, occupancy: status === "Inactive" ? 0 : undefined }, { new: true })
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
  const user = req.user
  const { roomId, studentId, bedNumber } = req.body
  try {
    const newAllocation = new RoomAllocation({
      userId: user._id,
      roomId,
      studentProfileId: studentId,
      bedNumber,
    })

    const savedAllocation = await newAllocation.save()

    const studentProfile = await StudentProfile.findByIdAndUpdate(studentId, { currentRoomAllocation: savedAllocation._id }, { new: true })

    res.status(200).json({ message: "Room allocated successfully", success: true })
  } catch (error) {
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

  try {
    const roomChangeRequests = await RoomChangeRequest.find({ status: "Pending", hostelId: hostelId })
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

    console.log("Room Change Requests:", roomChangeRequests)

    const formattedRequests = roomChangeRequests.map((request) => {
      return {
        id: request._id,
        student: {
          name: request.userId.name,
          email: request.userId.email,
        },
        currentRoom: {
          roomNumber: request.currentAllocationId && request.currentAllocationId.room ? request.currentAllocationId.room.roomNumber : null,
          unitNumber: request.currentAllocationId && request.currentAllocationId.room ? request.currentAllocationId.room.unitId.unitNumber : null,
        },
        requestedRoom: {
          roomNumber: request.requestedRoomId ? request.requestedRoomId.roomNumber : null,
          unitNumber: request.requestedUnitId ? request.requestedUnitId.unitNumber : null,
        },
        reason: request.reason,
        status: request.status,
        createdAt: request.createdAt,
      }
    })

    res.status(200).json(formattedRequests)
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
    }

    res.status(200).json(finalResult)
  } catch (error) {
    console.error("Error fetching room change request:", error)
    res.status(500).json({ message: "Error fetching room change request", error: error.message })
  }
}
