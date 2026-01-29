/**
 * Authorization Middleware
 * Handles role-based and permission-based access control
 */
import { hasPermission } from "../utils/permissions.js"

/**
 * Middleware to check if user has required role
 * @param {string[]} roles - Allowed roles
 */
export const authorizeRoles = (roles = []) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: "Authentication required" })
      }

      if (roles.length === 0 || roles.includes(req.user.role)) {
        return next()
      }

      console.log(req.user)

      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: "Authorization error",
        error: error.message,
      })
    }
  }
}

/**
 * Middleware to check if user is a student manager
 */
export const isStudentManager = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    const authorizedRoles = ["Warden", "Admin", "Super Admin", "Associate Warden", "Hostel Supervisor"]

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

/**
 * Middleware to check if user has permission for a resource action
 * @param {string} resource - Resource name (e.g., 'complaints', 'students')
 * @param {string} action - Action name (e.g., 'view', 'edit', 'create', 'delete')
 */
export const requirePermission = (resource, action) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      })
    }

    if (hasPermission(req.user, resource, action)) {
      return next()
    }

    return res.status(403).json({
      success: false,
      message: "You don't have permission to perform this action",
    })
  }
}
