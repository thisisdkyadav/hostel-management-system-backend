/**
 * Authorization Middleware
 * Handles role-based access control
 */

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
