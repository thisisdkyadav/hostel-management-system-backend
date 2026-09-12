/**
 * Authentication Middleware
 * Handles session-based authentication
 */
import { userQueries } from "../services/user/userQueries.service.js"
import { AUTHZ_CATALOG_VERSION, buildEffectiveAuthzForUser, extractUserAuthzOverride } from "../core/authz/index.js"

const buildPersistedSessionAuthz = (userLike) => ({
  override: extractUserAuthzOverride(userLike),
})

const withAuthzSessionData = (sessionUserData = {}) => {
  const { permissions: _legacyPermissions, ...sanitizedUserData } = sessionUserData

  if (
    sanitizedUserData?.authz?.effective &&
    sanitizedUserData.authz.effective.catalogVersion === AUTHZ_CATALOG_VERSION
  ) {
    // Hydrate in-memory only. The Redis document is shared with Go, which
    // omits authz.effective by contract. Writing it back reissues Set-Cookie
    // and logs non-student users out on reload in development.
    return { userData: sanitizedUserData, shouldPersist: false }
  }

  const fallbackOverride = sanitizedUserData?.authz?.override || {}
  const fallbackAuthz = buildEffectiveAuthzForUser({
    role: sanitizedUserData.role,
    subRole: sanitizedUserData.subRole ?? null,
    authz: { override: fallbackOverride },
  })
  const nextUserData = {
    ...sanitizedUserData,
    authz: {
      override: fallbackOverride,
      effective: fallbackAuthz,
    },
  }

  return { userData: nextUserData, shouldPersist: false }
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
    const user = await userQueries.findByIdSafe(req.session.userId)

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" })
    }

    // Update session with fresh essential data
    req.session.userData = {
      _id: user._id,
      email: user.email,
      role: user.role,
      subRole: user.subRole,
      authz: buildPersistedSessionAuthz(user),
      hostel: user.hostel,
      pinnedTabs: Array.isArray(user.pinnedTabs) ? user.pinnedTabs : [],
      sidebarMode: user.sidebarMode || undefined,
      theme: user.theme || undefined,
    }

    req.user = withAuthzSessionData(req.session.userData).userData

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
      const user = await userQueries.findByIdSafe(req.session.userId)

      if (!user) {
        return res.status(401).json({ success: false, message: "User not found" })
      }

      // Store essential data in session for future requests
      req.session.userData = {
        _id: user._id,
        email: user.email,
        role: user.role,
        subRole: user.subRole,
        authz: buildPersistedSessionAuthz(user),
        hostel: user.hostel,
        pinnedTabs: Array.isArray(user.pinnedTabs) ? user.pinnedTabs : [],
        sidebarMode: user.sidebarMode || undefined,
        theme: user.theme || undefined,
      }

      req.user = withAuthzSessionData(req.session.userData).userData
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
