import CheckInOut from "../../models/CheckInOut.js"
import Hostel from "../../models/Hostel.js"
import * as liveCheckInOutService from "../../services/liveCheckInOutService.js"

/**
 * Get live check-in/out entries with advanced filters
 */
export const getLiveCheckInOutEntries = async (req, res) => {
  try {
    const result = await liveCheckInOutService.getLiveEntries(req.query)

    res.status(200).json({
      success: true,
      data: result.entries,
      pagination: result.pagination,
      stats: result.stats,
    })
  } catch (error) {
    console.error("Error fetching live check-in/out entries:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch entries",
      error: error.message,
    })
  }
}

/**
 * Get hostel-wise check-in/out stats
 */
export const getHostelWiseStats = async (req, res) => {
  try {
    const hostelStats = await liveCheckInOutService.getHostelWiseStats()

    res.status(200).json({
      success: true,
      data: hostelStats,
    })
  } catch (error) {
    console.error("Error fetching hostel-wise stats:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch hostel stats",
      error: error.message,
    })
  }
}

/**
 * Get recent activity timeline
 */
export const getRecentActivity = async (req, res) => {
  try {
    const { limit = 50 } = req.query
    const recentEntries = await liveCheckInOutService.getRecentActivity(limit)

    res.status(200).json({
      success: true,
      data: recentEntries,
    })
  } catch (error) {
    console.error("Error fetching recent activity:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch recent activity",
      error: error.message,
    })
  }
}

/**
 * Get time-based analytics (hourly distribution)
 */
export const getTimeBasedAnalytics = async (req, res) => {
  try {
    const { date } = req.query
    const result = await liveCheckInOutService.getTimeBasedAnalytics(date)

    res.status(200).json({
      success: true,
      data: result.data,
      date: result.date,
    })
  } catch (error) {
    console.error("Error fetching time-based analytics:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch analytics",
      error: error.message,
    })
  }
}
