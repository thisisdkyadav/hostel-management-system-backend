import StudentProfile from "../models/StudentProfile.js"
import Hostel from "../models/Hostel.js"
import Room from "../models/Room.js"
import Unit from "../models/Unit.js"
import Event from "../models/Event.js"
import Complaint from "../models/Complaint.js"
import { isDevelopmentEnvironment } from "../config/environment.js"
import mongoose from "mongoose"

/**
 * Get dashboard data for admin
 */
export const getDashboardData = async (req, res) => {
  try {
    const [studentData, hostelData, eventsData, complaintsData] = await Promise.all([getStudentStats(), getHostelStats(), getEvents(), getComplaintStats()])

    return res.status(200).json({
      success: true,
      data: {
        students: studentData,
        hostels: hostelData,
        events: eventsData,
        complaints: complaintsData,
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

  return {
    // branchWise, // Commented out
    degreeWise,
    totalBoys,
    totalGirls,
    grandTotal,
  }
}

/**
 * Get hostel statistics including room and occupancy details
 */
const getHostelStats = async () => {
  const hostels = await Hostel.find()

  const hostelStatsPromises = hostels.map(async (hostel) => {
    // Get rooms for this hostel
    const rooms = await Room.find({ hostelId: hostel._id })

    // Calculate room statistics
    const totalRooms = rooms.length
    const activeRooms = rooms.filter((room) => room.status === "Active").length
    const inactiveRooms = totalRooms - activeRooms

    // Calculate capacity and occupancy
    const totalCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0)
    const currentOccupancy = rooms.reduce((sum, room) => sum + room.occupancy, 0)
    const vacantCapacity = totalCapacity - currentOccupancy

    return {
      name: hostel.name,
      gender: hostel.gender,
      type: hostel.type,
      totalRooms,
      occupied: activeRooms - (totalCapacity - currentOccupancy > 0 ? 1 : 0), // Approximation for visualization
      vacant: inactiveRooms + (totalCapacity - currentOccupancy > 0 ? 1 : 0), // Approximation for visualization
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
    byCategory,
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
