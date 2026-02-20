/**
 * AuthZ Middleware (Layer-3)
 *
 * Important:
 * - Layer-1 RBAC (`authorizeRoles`) is unchanged.
 * - This middleware is additive and can be applied route-by-route later.
 */

import {
  AUTHZ_MODES,
  buildEffectiveAuthz,
  canAllCapabilities,
  canAnyCapability,
  canCapability,
  canRoute,
} from "../core/authz/index.js"
import env from "../config/env.config.js"

const normalizeKey = (value) => (typeof value === "string" ? value.trim() : "")

const toKeySet = (values = []) => {
  if (!Array.isArray(values)) return new Set()
  return new Set(values.map((value) => normalizeKey(value)).filter(Boolean))
}

const getAuthzMode = () => {
  const mode = String(env.AUTHZ_MODE || AUTHZ_MODES.OBSERVE).trim().toLowerCase()
  if (mode === AUTHZ_MODES.OFF || mode === AUTHZ_MODES.ENFORCE || mode === AUTHZ_MODES.OBSERVE) {
    return mode
  }
  return AUTHZ_MODES.OBSERVE
}

const getEnforcedRouteKeySet = () => toKeySet(env.AUTHZ_ENFORCE_ROUTE_KEYS || [])
const getEnforcedCapabilityKeySet = () => toKeySet(env.AUTHZ_ENFORCE_CAPABILITY_KEYS || [])
const shouldLogObserveDeny = () => Boolean(env.AUTHZ_OBSERVE_LOG_DENIES)

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

const shouldEnforceRouteKey = (routeKey) => {
  const mode = getAuthzMode()
  if (mode === AUTHZ_MODES.ENFORCE) return true
  if (mode !== AUTHZ_MODES.OBSERVE) return false

  const key = normalizeKey(routeKey)
  if (!key) return false

  const enforcedRouteKeySet = getEnforcedRouteKeySet()
  return enforcedRouteKeySet.has("*") || enforcedRouteKeySet.has(key)
}

const shouldEnforceCapabilityKeys = (capabilityKeys = []) => {
  const mode = getAuthzMode()
  if (mode === AUTHZ_MODES.ENFORCE) return true
  if (mode !== AUTHZ_MODES.OBSERVE) return false

  const normalizedKeys = Array.isArray(capabilityKeys)
    ? capabilityKeys.map((key) => normalizeKey(key)).filter(Boolean)
    : []

  if (normalizedKeys.length === 0) return false

  const enforcedCapabilityKeySet = getEnforcedCapabilityKeySet()
  if (enforcedCapabilityKeySet.has("*")) return true
  return normalizedKeys.some((key) => enforcedCapabilityKeySet.has(key))
}

const logObserveDenyPreview = (req, kind, keys) => {
  if (!shouldLogObserveDeny()) return
  if (getAuthzMode() !== AUTHZ_MODES.OBSERVE) return

  const normalizedKeys = (Array.isArray(keys) ? keys : [keys])
    .map((key) => normalizeKey(key))
    .filter(Boolean)

  const keySummary = normalizedKeys.join(", ")
  const userId = req?.user?._id ? String(req.user._id) : "unknown"
  const role = req?.user?.role || "unknown"
  const path = req?.originalUrl || req?.url || "unknown"
  const method = req?.method || "UNKNOWN"

  console.warn(
    `[authz][observe][deny-preview] ${method} ${path} user=${userId} role=${role} type=${kind} keys=${keySummary}`
  )
}

export const requireRouteAccess = (routeKey) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" })
    }

    const effectiveAuthz = getEffectiveAuthzFromRequest(req)
    const allowed = canRoute(effectiveAuthz, routeKey)
    const shouldEnforce = shouldEnforceRouteKey(routeKey)

    if (allowed) {
      return next()
    }

    if (!shouldEnforce) {
      logObserveDenyPreview(req, "route", routeKey)
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
    const shouldEnforce = shouldEnforceCapabilityKeys([normalizedCapabilityKey])

    if (allowed) {
      return next()
    }

    if (!shouldEnforce) {
      logObserveDenyPreview(req, "capability", capabilityKey)
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
    const shouldEnforce = shouldEnforceCapabilityKeys(normalizedCapabilityKeys)

    if (allowed) {
      return next()
    }

    if (!shouldEnforce) {
      logObserveDenyPreview(req, "any-capability", capabilityKeys)
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
    const shouldEnforce = shouldEnforceCapabilityKeys(normalizedCapabilityKeys)

    if (allowed) {
      return next()
    }

    if (!shouldEnforce) {
      logObserveDenyPreview(req, "all-capability", capabilityKeys)
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
