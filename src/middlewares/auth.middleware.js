/**
 * Authentication Middleware
 * Handles session-based authentication
 */
// Using old model paths until Phase 3 (Models Migration)
import { User } from "../models/index.js"
import { buildEffectiveAuthzForUser, extractUserAuthzOverride } from "../core/authz/index.js"

const buildSessionAuthz = (userLike) => {
  const override = extractUserAuthzOverride(userLike)
  const effective = buildEffectiveAuthzForUser({
    role: userLike.role,
    authz: { override },
  })

  return { override, effective }
}

const withAuthzSessionData = (sessionUserData = {}) => {
  const hasLegacyPermissions = Object.prototype.hasOwnProperty.call(sessionUserData, "permissions")
  const { permissions: _legacyPermissions, ...sanitizedUserData } = sessionUserData

  if (sanitizedUserData?.authz?.effective) {
    return { userData: sanitizedUserData, shouldPersist: hasLegacyPermissions && sanitizedUserData.role !== "Student" }
  }

  const fallbackOverride = sanitizedUserData?.authz?.override || {}
  const fallbackAuthz = buildEffectiveAuthzForUser({
    role: sanitizedUserData.role,
    authz: { override: fallbackOverride },
  })
  const nextUserData = {
    ...sanitizedUserData,
    authz: {
      override: fallbackOverride,
      effective: fallbackAuthz,
    },
  }

  // Student traffic is dominant and does not need session rewrites for authz hydration.
  const shouldPersist = sanitizedUserData.role !== "Student"
  return { userData: nextUserData, shouldPersist }
}

/**
 * Helper function to refresh user data in session
 */
export const refreshUserData = async (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ success: false, message: "Authentication required" })
  }

  try {
    // Get fresh user data from database
    const user = await User.findById(req.session.userId).select("-password").exec()

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" })
    }

    // Update session with fresh essential data
    req.session.userData = {
      _id: user._id,
      email: user.email,
      role: user.role,
      subRole: user.subRole,
      authz: buildSessionAuthz(user),
      hostel: user.hostel,
      pinnedTabs: Array.isArray(user.pinnedTabs) ? user.pinnedTabs : [],
    }

    // Set req.user directly from session data
    req.user = req.session.userData

    next()
  } catch (error) {
    return res.status(500).json({ success: false, message: "Failed to refresh user data" })
  }
}

/**
 * Middleware to check if user is authenticated using sessions
 */
export const authenticate = async (req, res, next) => {
  try {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    // If we have essential user data in session, use it directly
    if (req.session.userData) {
      const { userData, shouldPersist } = withAuthzSessionData(req.session.userData)
      req.user = userData
      if (shouldPersist) {
        req.session.userData = userData
      }
    } else {
      // Otherwise query the database and cache essential data in session
      const user = await User.findById(req.session.userId).select("-password").exec()

      if (!user) {
        return res.status(401).json({ success: false, message: "User not found" })
      }

      // Store essential data in session for future requests
      req.session.userData = {
        _id: user._id,
        email: user.email,
        role: user.role,
        subRole: user.subRole,
        authz: buildSessionAuthz(user),
        hostel: user.hostel,
        pinnedTabs: Array.isArray(user.pinnedTabs) ? user.pinnedTabs : [],
      }

      req.user = req.session.userData
    }

    next()
  } catch (error) {
    console.error("Authentication error:", error)
    return res.status(401).json({ success: false, message: "Authentication failed" })
  }
}

/**
 * Middleware to ensure session has been initialized
 */
export const ensureSession = (req, res, next) => {
  if (!req.session) {
    return res.status(500).json({ success: false, message: "Session initialization failed" })
  }
  next()
}
