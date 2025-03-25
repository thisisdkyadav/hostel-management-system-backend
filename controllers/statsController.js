import Hostel from "../models/Hostel.js"
import Warden from "../models/Warden.js"
import StudentProfile from "../models/StudentProfile.js"
import Complaint from "../models/Complaint.js"
import Event from "../models/Events.js"
import LostAndFound from "../models/LostAndFound.js"
import Security from "../models/Security.js"
import MaintenanceStaff from "../models/MaintenanceStaff.js"
import Room from "../models/Room.js"
import RoomChangeRequest from "../models/RoomChangeRequest.js"
import Visitors from "../models/Visitors.js"
import Unit from "../models/Unit.js"

// required stats totalHostels, totalRooms, occupancyRate, AvailableRooms
export const getHostelStats = async (req, res) => {
  try {
    const totalHostels = await Hostel.countDocuments()
    const rooms = await Room.find()
    const totalRooms = rooms.length
    const occupiedRooms = rooms.filter((room) => room.occupancy > 0).length
    const availableRooms = totalRooms - occupiedRooms
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0

    res.status(200).json({
      totalHostels,
      totalRooms,
      occupancyRate,
      availableRooms,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// required stats totalWardens, assignedWardens, unassignedWardens
export const getWardenStats = async (req, res) => {
  try {
    const totalWardens = await Warden.countDocuments()
    const assignedWardens = await Warden.countDocuments({ status: "assigned" })
    const unassignedWardens = await Warden.countDocuments({ status: "unassigned" })

    res.status(200).json({
      total: totalWardens,
      assigned: assignedWardens,
      unassigned: unassignedWardens,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// required stats totalEvents, upcomingEvents, pastEvents
export const getEventStats = async (req, res) => {
  const { hostelId } = req.params
  try {
    const currentDate = new Date()
    const totalEvents = await Event.countDocuments({ hostelId })
    const upcomingEvents = await Event.countDocuments({ dateAndTime: { $gt: currentDate }, hostelId })
    const pastEvents = await Event.countDocuments({ dateAndTime: { $lte: currentDate }, hostelId })

    res.status(200).json({
      total: totalEvents,
      upcoming: upcomingEvents,
      past: pastEvents,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// required stats totalLostAndFound, ActiveLostAndFound, ClaimedLostAndFound
export const getLostAndFoundStats = async (req, res) => {
  try {
    const totalLostAndFound = await LostAndFound.countDocuments()
    const activeLostAndFound = await LostAndFound.countDocuments({ status: "Active" })
    const claimedLostAndFound = await LostAndFound.countDocuments({ status: "Claimed" })

    res.status(200).json({
      total: totalLostAndFound,
      active: activeLostAndFound,
      claimed: claimedLostAndFound,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// required stats totalSecurityStaff, assignedSecurityStaff, unassignedSecurityStaff
export const getSecurityStaffStats = async (req, res) => {
  try {
    const totalSecurityStaff = await Security.countDocuments()
    const assignedSecurityStaff = await Security.countDocuments({ hostelId: { $ne: null } })
    const unassignedSecurityStaff = await Security.countDocuments({ hostelId: null })

    res.status(200).json({
      total: totalSecurityStaff,
      assigned: assignedSecurityStaff,
      unassigned: unassignedSecurityStaff,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// required stats totalMaintenanceStaff, plumbingStaff, electricalStaff, cleanlinessStaff, internetStaff, civilStaff
export const getMaintenanceStaffStats = async (req, res) => {
  try {
    const totalMaintenanceStaff = await MaintenanceStaff.countDocuments()
    const plumbingStaff = await MaintenanceStaff.countDocuments({ category: "Plumbing" })
    const electricalStaff = await MaintenanceStaff.countDocuments({ category: "Electrical" })
    const cleanlinessStaff = await MaintenanceStaff.countDocuments({ category: "Cleanliness" })
    const internetStaff = await MaintenanceStaff.countDocuments({ category: "Internet" })
    const civilStaff = await MaintenanceStaff.countDocuments({ category: "Civil" })

    res.status(200).json({
      total: totalMaintenanceStaff,
      plumbing: plumbingStaff,
      electrical: electricalStaff,
      cleanliness: cleanlinessStaff,
      internet: internetStaff,
      civil: civilStaff,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// required stats totalRooms, availableRooms, occupiedRooms
export const getRoomStats = async (req, res) => {
  const { hostelId } = req.params
  try {
    const totalRooms = await Room.countDocuments({ hostelId })
    const availableRooms = await Room.countDocuments({ occupancy: 0, hostelId })
    const occupiedRooms = await Room.countDocuments({ occupancy: { $gt: 0 }, hostelId })

    res.status(200).json({
      totalRooms,
      availableRooms,
      occupiedRooms,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// required stats totalRoomChangeRequests, pendingRoomChangeRequests, approvedRoomChangeRequests, rejectedRoomChangeRequests
export const getRoomChangeRequestStats = async (req, res) => {
  const { hostelId } = req.params
  try {
    const totalRoomChangeRequests = await RoomChangeRequest.countDocuments({ hostelId })
    const pendingRoomChangeRequests = await RoomChangeRequest.countDocuments({ status: "Pending", hostelId })
    const approvedRoomChangeRequests = await RoomChangeRequest.countDocuments({ status: "Approved", hostelId })
    const rejectedRoomChangeRequests = await RoomChangeRequest.countDocuments({ status: "Rejected", hostelId })

    res.status(200).json({
      total: totalRoomChangeRequests,
      pending: pendingRoomChangeRequests,
      approved: approvedRoomChangeRequests,
      rejected: rejectedRoomChangeRequests,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// required stats totalVisitors, checkedInVisitors, checkedOutVisitors, todaysVisitors
export const getVisitorStats = async (req, res) => {
  const { hostelId } = req.params
  try {
    const currentDate = new Date()
    const totalVisitors = await Visitors.countDocuments({ hostelId })
    const checkedInVisitors = await Visitors.countDocuments({ status: "Checked In", hostelId })
    const checkedOutVisitors = await Visitors.countDocuments({ status: "Checked Out", hostelId })
    const todaysVisitors = await Visitors.countDocuments({
      hostelId,
      checkIn: { $gte: new Date(currentDate.setHours(0, 0, 0, 0)) },
      checkIn: { $lt: new Date(currentDate.setHours(23, 59, 59, 999)) },
    })

    res.status(200).json({
      total: totalVisitors,
      checkedIn: checkedInVisitors,
      checkedOut: checkedOutVisitors,
      todays: todaysVisitors,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// required stats totalComplaints, pendingComplaints, resolvedComplaints, inProcessComplaints
export const getComplaintsStats = async (req, res) => {
  try {
    const totalComplaints = await Complaint.countDocuments()
    const pendingComplaints = await Complaint.countDocuments({ status: "Pending" })
    const resolvedComplaints = await Complaint.countDocuments({ status: "Resolved" })
    const inProcessComplaints = await Complaint.countDocuments({ status: "In Process" })

    res.status(200).json({
      total: totalComplaints,
      pending: pendingComplaints,
      resolved: resolvedComplaints,
      inProcess: inProcessComplaints,
    })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
