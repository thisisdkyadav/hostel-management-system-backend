/**
 * AuthZ Middleware (Layer-3)
 *
 * Important:
 * - Layer-1 RBAC (`authorizeRoles`) is unchanged.
 * - Layer-3 is strict: deny on failed route/capability checks.
 */

import {
  buildEffectiveAuthz,
  canAllCapabilities,
  canAnyCapability,
  canCapability,
  canRoute,
} from "../core/authz/index.js"

const normalizeKey = (value) => (typeof value === "string" ? value.trim() : "")

const buildFallbackEffectiveAuthz = (req) => {
  return buildEffectiveAuthz({ role: req?.user?.role, override: {} })
}

const getEffectiveAuthzFromRequest = (req) => {
  if (req?.user?.authz?.effective) {
    return req.user.authz.effective
  }

  return buildFallbackEffectiveAuthz(req)
}

const deny = (res, message = "Access denied") => {
  return res.status(403).json({ success: false, message })
}

export const requireRouteAccess = (routeKey) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    const effectiveAuthz = getEffectiveAuthzFromRequest(req)
    const allowed = canRoute(effectiveAuthz, routeKey)

    if (allowed) {
      return next()
    }

    return deny(res, "You do not have access to this route")
  }
}

export const requireCapability = (capabilityKey) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    const normalizedCapabilityKey = normalizeKey(capabilityKey)
    if (!normalizedCapabilityKey) return next()

    const effectiveAuthz = getEffectiveAuthzFromRequest(req)
    const allowed = canCapability(effectiveAuthz, normalizedCapabilityKey)

    if (allowed) {
      return next()
    }

    return deny(res, "You do not have permission to perform this action")
  }
}

export const requireAnyCapability = (capabilityKeys = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    const normalizedCapabilityKeys = Array.isArray(capabilityKeys)
      ? capabilityKeys.map((key) => normalizeKey(key)).filter(Boolean)
      : []
    if (normalizedCapabilityKeys.length === 0) return next()

    const effectiveAuthz = getEffectiveAuthzFromRequest(req)
    const allowed = canAnyCapability(effectiveAuthz, normalizedCapabilityKeys)

    if (allowed) {
      return next()
    }

    return deny(res, "You do not have permission to perform this action")
  }
}

export const requireAllCapabilities = (capabilityKeys = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    const normalizedCapabilityKeys = Array.isArray(capabilityKeys)
      ? capabilityKeys.map((key) => normalizeKey(key)).filter(Boolean)
      : []
    if (normalizedCapabilityKeys.length === 0) return next()

    const effectiveAuthz = getEffectiveAuthzFromRequest(req)
    const allowed = canAllCapabilities(effectiveAuthz, normalizedCapabilityKeys)

    if (allowed) {
      return next()
    }

    return deny(res, "You do not have permission to perform this action")
  }
}

export default {
  requireRouteAccess,
  requireCapability,
  requireAnyCapability,
  requireAllCapabilities,
}
