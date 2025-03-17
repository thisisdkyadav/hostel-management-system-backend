import jwt from "jsonwebtoken"
import User from "../models/User.js"

// Middleware to check if user is authenticated
export const isAuthenticated = async (req, res, next) => {
  try {
    const token = req.cookies.token || req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.id)

    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid authentication token" })
    }

    req.user = user
    next()
  } catch (error) {
    return res.status(401).json({ success: false, message: "Authentication failed" })
  }
}

// Middleware to check if user has student management permissions
export const isStudentManager = async (req, res, next) => {
  try {
    // Check if user exists and has been authenticated
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    // Check if user has one of the authorized roles
    const authorizedRoles = ["Warden", "Admin", "Super Admin"]

    if (!authorizedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Access denied. Only Wardens, Admins, and Super Admins can manage students",
      })
    }

    next()
  } catch (error) {
    return res.status(500).json({ success: false, message: "Server error", error: error.message })
  }
}
