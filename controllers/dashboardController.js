import StudentProfile from "../models/StudentProfile.js"
import Hostel from "../models/Hostel.js"
import Room from "../models/Room.js"
import Unit from "../models/Unit.js"
import Event from "../models/Event.js"
import Complaint from "../models/Complaint.js"
import { isDevelopmentEnvironment } from "../config/environment.js"
import mongoose from "mongoose"
import { getConfigWithDefault } from "../utils/configDefaults.js"
import Leave from "../models/Leave.js"

/**
 * Get dashboard data for admin
 */
export const getDashboardData = async (req, res) => {
  try {
    const [students, hostels, events, complaints, hostlerAndDayScholarCounts, leaves] = await Promise.all([getStudentStats(), getHostelStats(), getEvents(), getComplaintStats(), getHostlerAndDayScholarCounts(), getUsersOnLeave()])

    return res.status(200).json({
      success: true,
      data: {
        students,
        hostels,
        events,
        complaints,
        hostlerAndDayScholarCounts,
        leaves,
      },
    })
  } catch (error) {
    console.error("Dashboard data error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve dashboard data",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

/**
 * get Hostler and Day Scholar Counts - total , boys and girls in each hostler and day scholar
 * return data in the following format
 * {
 * hostler: {
 *  total: number,
 *  boys: number,
 *  girls: number,
 * },
 * dayScholar: {
 *  total: number,
 *  boys: number,
 *  girls: number,
 * }
 * }
 */
const getHostlerAndDayScholarCounts = async () => {
  // hostler count = total students - day scholar count
  const totalBoys = await StudentProfile.countDocuments({ gender: "Male", status: "Active" })
  const totalGirls = await StudentProfile.countDocuments({ gender: "Female", status: "Active" })
  const dayScholarBoys = await StudentProfile.countDocuments({ isDayScholar: true, gender: "Male", status: "Active" })
  const dayScholarGirls = await StudentProfile.countDocuments({ isDayScholar: true, gender: "Female", status: "Active" })
  const hostlerBoys = totalBoys - dayScholarBoys
  const hostlerGirls = totalGirls - dayScholarGirls
  return {
    hostler: {
      total: hostlerBoys + hostlerGirls,
      boys: hostlerBoys,
      girls: hostlerGirls,
    },
    dayScholar: {
      total: dayScholarBoys + dayScholarGirls,
      boys: dayScholarBoys,
      girls: dayScholarGirls,
    },
  }
}
/**
 * Get student statistics by branch, degree, and gender
 */
const getStudentStats = async (hostelId = null) => {
  console.log("hostelId", hostelId)
  // Comment out branch-wise student distribution
  /*
  const branchWiseData = await StudentProfile.aggregate([
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user"
      }
    },
    { $unwind: "$user" },
    {
      $group: {
        _id: {
          department: "$department",
          gender: "$gender"
        },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: "$_id.department",
        genders: {
          $push: {
            gender: "$_id.gender",
            count: "$count"
          }
        },
        total: { $sum: "$count" }
      }
    },
    { $match: { _id: { $ne: null } } }
  ])

  // Transform branch-wise data
  const branchWise = branchWiseData.map(branch => {
    const boys = branch.genders.find(g => g.gender === "Male")?.count || 0
    const girls = branch.genders.find(g => g.gender === "Female")?.count || 0
    
    return {
      branch: branch._id || "Unknown",
      boys,
      girls,
      total: branch.total
    }
  })
  */

  // Create pipeline for student aggregation
  const pipeline = []

  // Filter only active students
  pipeline.push({ $match: { status: "Active" } })

  // If hostelId is provided, filter students by that hostel
  if (hostelId) {
    // Convert hostelId to ObjectId if it's a string
    const hostelObjectId = typeof hostelId === "string" ? new mongoose.Types.ObjectId(hostelId) : hostelId

    pipeline.push(
      // First lookup to get the current room allocation
      {
        $lookup: {
          from: "roomallocations",
          localField: "currentRoomAllocation",
          foreignField: "_id",
          as: "allocation",
        },
      },
      // Unwind the allocation array
      { $unwind: { path: "$allocation", preserveNullAndEmptyArrays: false } },
      // Filter by hostelId
      { $match: { "allocation.hostelId": hostelObjectId } }
    )
  }

  // Add the rest of the pipeline stages
  pipeline.push(
    {
      $lookup: {
        from: "users",
        localField: "userId",
        foreignField: "_id",
        as: "user",
      },
    },
    { $unwind: "$user" },
    {
      $group: {
        _id: {
          degree: "$degree",
          gender: "$gender",
        },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: "$_id.degree",
        genders: {
          $push: {
            gender: "$_id.gender",
            count: "$count",
          },
        },
        total: { $sum: "$count" },
      },
    },
    { $match: { _id: { $ne: null } } }
  )

  // Get degree-wise student distribution
  const degreeWiseData = await StudentProfile.aggregate(pipeline)

  // Transform degree-wise data
  const degreeWise = degreeWiseData.map((degree) => {
    const boys = degree.genders.find((g) => g.gender === "Male")?.count || 0
    const girls = degree.genders.find((g) => g.gender === "Female")?.count || 0

    return {
      degree: degree._id || "Unknown",
      boys,
      girls,
      total: degree.total,
    }
  })

  // Create pipeline for gender totals
  const genderPipeline = []

  // Filter only active students
  genderPipeline.push({ $match: { status: "Active" } })

  // If hostelId is provided, filter students by that hostel
  if (hostelId) {
    // Convert hostelId to ObjectId if it's a string
    const hostelObjectId = typeof hostelId === "string" ? new mongoose.Types.ObjectId(hostelId) : hostelId

    genderPipeline.push(
      // First lookup to get the current room allocation
      {
        $lookup: {
          from: "roomallocations",
          localField: "currentRoomAllocation",
          foreignField: "_id",
          as: "allocation",
        },
      },
      // Unwind the allocation array
      { $unwind: { path: "$allocation", preserveNullAndEmptyArrays: false } },
      // Filter by hostelId
      { $match: { "allocation.hostelId": hostelObjectId } }
    )
  }

  // Add the group stage for gender totals
  genderPipeline.push({
    $group: {
      _id: "$gender",
      count: { $sum: 1 },
    },
  })

  // Get total gender counts
  const genderTotals = await StudentProfile.aggregate(genderPipeline)
  console.log("genderTotals", genderTotals)
  const totalBoys = genderTotals.find((g) => g._id === "Male")?.count || 0
  const totalGirls = genderTotals.find((g) => g._id === "Female")?.count || 0
  const grandTotal = totalBoys + totalGirls

  const registeredStudents = await getConfigWithDefault("registeredStudents")

  // Create a map of existing degrees for quick lookup
  const existingDegrees = new Map(degreeWise.map((degree) => [degree.degree, degree]))

  // Add registered students to existing degreeWise entries
  degreeWise.forEach((degree) => {
    const registeredData = registeredStudents.value[degree.degree]
    degree.registeredStudents = registeredData ? registeredData.total : 0
    // add new format
    degree.registered = registeredData || { total: 0, boys: 0, girls: 0 }
  })

  // Add degrees that exist only in registered students but not in degreeWise (only if total > 0)
  Object.keys(registeredStudents.value).forEach((degreeName) => {
    const registeredData = registeredStudents.value[degreeName]
    if (!existingDegrees.has(degreeName) && registeredData && registeredData.total > 0) {
      degreeWise.push({
        degree: degreeName,
        boys: 0,
        girls: 0,
        total: 0,
        registeredStudents: registeredData.total,
        registered: registeredData,
      })
    }
  })

  const totalRegisteredStudents = Object.values(registeredStudents.value).reduce((sum, degreeData) => sum + (degreeData.total || 0), 0)

  // reorder in alphabetical order
  degreeWise.sort((a, b) => a.degree.localeCompare(b.degree))

  return {
    // branchWise, // Commented out
    degreeWise,
    totalBoys,
    totalGirls,
    grandTotal,
    totalRegisteredStudents,
  }
}

/**
 * Get hostel statistics including room and occupancy details
 */
const getHostelStats = async () => {
  const hostels = await Hostel.find({ isArchived: false })

  const hostelStatsPromises = hostels.map(async (hostel) => {
    // Get rooms for this hostel
    const rooms = await Room.find({ hostelId: hostel._id, status: "Active" })

    // Calculate room statistics
    const totalRooms = rooms.length

    // Calculate capacity and occupancy
    const totalCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0)
    const currentOccupancy = rooms.reduce((sum, room) => sum + room.occupancy, 0)
    const vacantCapacity = totalCapacity - currentOccupancy

    return {
      name: hostel.name,
      gender: hostel.gender,
      type: hostel.type,
      totalRooms,
      totalCapacity,
      currentOccupancy,
      vacantCapacity,
    }
  })

  return Promise.all(hostelStatsPromises)
}

/**
 * Get upcoming events
 */
const getEvents = async () => {
  const currentDate = new Date()

  // Get upcoming events (from today onwards)
  const events = await Event.find({
    dateAndTime: { $gte: currentDate },
  })
    .sort({ dateAndTime: 1 })
    .limit(5)
    .populate("hostelId", "name")

  return events.map((event) => {
    const date = new Date(event.dateAndTime)

    return {
      id: event._id,
      title: event.eventName,
      description: event.description,
      date: date.toISOString().split("T")[0],
      time: date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
      location: event.hostelId?.name || "All Hostels",
      gender: event.gender || "All",
    }
  })
}

/**
 * Get complaint statistics
 */
const getComplaintStats = async () => {
  // Get total complaints by status
  const statusCounts = await Complaint.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ])

  const total = statusCounts.reduce((sum, status) => sum + status.count, 0)
  const pending = statusCounts.find((s) => s._id === "Pending")?.count || 0
  const inProgress = statusCounts.find((s) => s._id === "In Progress")?.count || 0
  const resolved = statusCounts.find((s) => s._id === "Resolved")?.count || 0
  const forwardedToIDO = statusCounts.find((s) => s._id === "Forwarded to IDO")?.count || 0

  // Get complaints resolved today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const resolvedToday = await Complaint.countDocuments({
    status: "Resolved",
    resolutionDate: { $gte: today },
  })

  // Get complaints by category
  const categoryCounts = await Complaint.aggregate([
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
  ])

  const byCategory = {}
  categoryCounts.forEach((category) => {
    byCategory[category._id.toLowerCase()] = category.count
  })

  // Get recent complaints
  const recentComplaints = await Complaint.find().sort({ createdAt: -1 }).limit(5).populate("userId", "name").populate("hostelId", "name").populate("roomId", "roomNumber").populate("unitId", "unitNumber")

  // count of complaints are older than 20 days and status is not Resolved or Rejected
  const thresholdDate = new Date()
  thresholdDate.setDate(thresholdDate.getDate() - 20)

  const overdueCount = await Complaint.countDocuments({
    status: { $ne: "Resolved", $ne: "Rejected" },
    createdAt: { $lt: thresholdDate },
  })

  const formattedRecentComplaints = recentComplaints.map((complaint) => ({
    id: complaint._id,
    title: complaint.title,
    category: complaint.category,
    status: complaint.status,
    date: complaint.createdAt.toISOString().split("T")[0],
    studentName: complaint.userId.name,
    location: complaint.location || `${complaint.hostelId?.name || ""} ${complaint.unitId?.unitNumber || ""}-${complaint.roomId?.roomNumber || ""}`,
  }))

  return {
    total,
    pending,
    inProgress,
    resolved,
    resolvedToday,
    forwardedToIDO,
    byCategory,
    overdueCount,
    recentComplaints: formattedRecentComplaints,
  }
}

/**
 * Get student statistics only
 */
export const getStudentStatistics = async (req, res) => {
  const user = req.user
  try {
    let hostelId = null
    // console.log("user", user)
    if (user.hostel) {
      hostelId = user.hostel._id
    }
    const studentData = await getStudentStats(hostelId)

    return res.status(200).json({
      success: true,
      data: studentData,
    })
  } catch (error) {
    console.error("Student statistics error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve student statistics",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

/**
 * Get hostel statistics only
 */
export const getHostelStatistics = async (req, res) => {
  try {
    const hostelData = await getHostelStats()

    return res.status(200).json({
      success: true,
      data: hostelData,
    })
  } catch (error) {
    console.error("Hostel statistics error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve hostel statistics",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

/**
 * Get events data only
 */
export const getEventsData = async (req, res) => {
  try {
    const eventsData = await getEvents()

    return res.status(200).json({
      success: true,
      data: eventsData,
    })
  } catch (error) {
    console.error("Events data error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve events data",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

/**
 * Get complaints statistics only
 */
export const getComplaintsStatistics = async (req, res) => {
  try {
    const complaintsData = await getComplaintStats()

    return res.status(200).json({
      success: true,
      data: complaintsData,
    })
  } catch (error) {
    console.error("Complaints statistics error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve complaints statistics",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

export const getStudentCount = async (req, res) => {
  const user = req.user
  try {
    let hostelId = null
    if (user.hostel) {
      hostelId = user.hostel._id
    }

    // Create pipeline for gender counts
    const genderPipeline = []

    // If hostelId is provided, filter students by that hostel
    if (hostelId) {
      // Convert hostelId to ObjectId if it's a string
      const hostelObjectId = typeof hostelId === "string" ? new mongoose.Types.ObjectId(hostelId) : hostelId

      genderPipeline.push(
        // First lookup to get the current room allocation
        {
          $lookup: {
            from: "roomallocations",
            localField: "currentRoomAllocation",
            foreignField: "_id",
            as: "allocation",
          },
        },
        // Unwind the allocation array
        { $unwind: { path: "$allocation", preserveNullAndEmptyArrays: false } },
        // Filter by hostelId
        { $match: { "allocation.hostelId": hostelObjectId } }
      )
    }

    // Add the group stage for gender totals
    genderPipeline.push({
      $group: {
        _id: "$gender",
        count: { $sum: 1 },
      },
    })

    // Get total gender counts
    const genderTotals = await StudentProfile.aggregate(genderPipeline)
    const totalBoys = genderTotals.find((g) => g._id === "Male")?.count || 0
    const totalGirls = genderTotals.find((g) => g._id === "Female")?.count || 0
    const grandTotal = totalBoys + totalGirls

    return res.status(200).json({
      success: true,
      data: {
        count: {
          total: grandTotal,
          boys: totalBoys,
          girls: totalGirls,
        },
      },
    })
  } catch (error) {
    console.error("Student count error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve student count",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

export const getWardenHostelStatistics = async (req, res) => {
  const user = req.user
  try {
    if (!user?.hostel?._id) {
      return res.status(400).json({ success: false, message: "User is not assigned to any hostel" })
    }

    const hostelId = user.hostel._id

    const hostel = await Hostel.findById(hostelId, { _id: 1, name: 1, type: 1, gender: 1, isArchived: 1 })
    if (!hostel) {
      return res.status(404).json({ success: false, message: "Hostel not found" })
    }

    const [roomStats, maintenanceIssues] = await Promise.all([
      Room.aggregate([
        { $match: { hostelId: hostel._id } },
        {
          $group: {
            _id: null,
            totalRooms: { $sum: 1 },
            totalActiveRooms: { $sum: { $cond: [{ $eq: ["$status", "Active"] }, 1, 0] } },
            occupiedRoomsCount: { $sum: { $cond: [{ $gt: ["$occupancy", 0] }, 1, 0] } },
            vacantRoomsCount: { $sum: { $cond: [{ $and: [{ $eq: ["$occupancy", 0] }, { $eq: ["$status", "Active"] }] }, 1, 0] } },
            totalCapacity: { $sum: "$capacity" },
            totalOccupancy: { $sum: "$occupancy" },
            activeRoomsCapacity: { $sum: { $cond: [{ $eq: ["$status", "Active"] }, "$capacity", 0] } },
            activeRoomsOccupancy: { $sum: { $cond: [{ $eq: ["$status", "Active"] }, "$occupancy", 0] } },
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
      totalActiveRooms: 0,
      occupiedRooms: 0,
      vacantRooms: 0,
      capacity: 0,
      occupancyRate: 0,
      activeRoomsCapacity: 0,
      activeRoomsOccupancy: 0,
    }

    if (roomStats.length > 0) {
      const { totalRooms, totalActiveRooms, occupiedRoomsCount, vacantRoomsCount, totalCapacity, totalOccupancy, activeRoomsCapacity, activeRoomsOccupancy } = roomStats[0]

      stats = {
        totalRooms,
        totalActiveRooms,
        occupiedRooms: occupiedRoomsCount,
        vacantRooms: vacantRoomsCount,
        capacity: totalCapacity,
        occupancyRate: activeRoomsCapacity > 0 ? Math.round((activeRoomsOccupancy / activeRoomsCapacity) * 100) : 0,
        activeRoomsCapacity,
        activeRoomsOccupancy,
      }
    }

    const result = {
      id: hostel._id,
      name: hostel.name,
      type: hostel.type,
      gender: hostel.gender,
      totalRooms: stats.totalRooms,
      totalActiveRooms: stats.totalActiveRooms,
      occupiedRooms: stats.occupiedRooms,
      vacantRooms: stats.vacantRooms,
      maintenanceIssues,
      capacity: stats.capacity,
      occupancyRate: stats.occupancyRate,
      activeRoomsCapacity: stats.activeRoomsCapacity,
      activeRoomsOccupancy: stats.activeRoomsOccupancy,
      isArchived: hostel.isArchived,
    }

    return res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error("Warden hostel statistics error:", error)
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve warden hostel statistics",
      error: isDevelopmentEnvironment ? error.message : undefined,
    })
  }
}

export const getUsersOnLeave = async () => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Find leaves that are active today and approved
  const leaves = await Leave.find({
    startDate: { $lte: today },
    endDate: { $gte: today },
    status: "Approved",
  })
    .sort({ startDate: 1 })
    // populate requesting user and approver basic info
    .populate("userId", "name email")
    .populate("approvalBy", "name email")

  const count = leaves.length

  return {
    success: true,
    data: {
      count,
      leaves,
    },
  }
}
