import CheckInOut from "../../models/CheckInOut.js"
import Hostel from "../../models/Hostel.js"
import * as liveCheckInOutService from "../../services/liveCheckInOutService.js"
import { asyncHandler } from "../utils/index.js"

/**
 * Get live check-in/out entries with advanced filters
 */
export const getLiveCheckInOutEntries = asyncHandler(async (req, res) => {
  const result = await liveCheckInOutService.getLiveEntries(req.query)

  res.status(200).json({
    success: true,
    data: result.entries,
    pagination: result.pagination,
    stats: result.stats,
  })
})

/**
 * Get hostel-wise check-in/out stats
 */
export const getHostelWiseStats = asyncHandler(async (req, res) => {
  const hostelStats = await liveCheckInOutService.getHostelWiseStats()

  res.status(200).json({
    success: true,
    data: hostelStats,
  })
})

/**
 * Get recent activity timeline
 */
export const getRecentActivity = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query
  const recentEntries = await liveCheckInOutService.getRecentActivity(limit)

  res.status(200).json({
    success: true,
    data: recentEntries,
  })
})

/**
 * Get time-based analytics (hourly distribution)
 */
export const getTimeBasedAnalytics = asyncHandler(async (req, res) => {
  const { date } = req.query
  const result = await liveCheckInOutService.getTimeBasedAnalytics(date)

  res.status(200).json({
    success: true,
    data: result.data,
    date: result.date,
  })
})
