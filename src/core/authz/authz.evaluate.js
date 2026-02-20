/**
 * AuthZ evaluation helpers
 */

const normalizeKey = (value) => (typeof value === "string" ? value.trim() : "")

export const canRoute = (effectiveAuthz, routeKey) => {
  const key = normalizeKey(routeKey)
  if (!effectiveAuthz || !key) return false

  return Boolean(effectiveAuthz.routeAccess?.[key])
}

export const canCapability = (effectiveAuthz, capabilityKey) => {
  const key = normalizeKey(capabilityKey)
  if (!effectiveAuthz || !key) return false

  const explicit = effectiveAuthz.capabilities?.[key]
  if (typeof explicit === "boolean") {
    return explicit
  }

  return Boolean(effectiveAuthz.capabilities?.["*"])
}

export const canAnyCapability = (effectiveAuthz, capabilityKeys = []) => {
  if (!Array.isArray(capabilityKeys) || capabilityKeys.length === 0) return false

  return capabilityKeys.some((key) => canCapability(effectiveAuthz, key))
}

export const canAllCapabilities = (effectiveAuthz, capabilityKeys = []) => {
  if (!Array.isArray(capabilityKeys) || capabilityKeys.length === 0) return false

  return capabilityKeys.every((key) => canCapability(effectiveAuthz, key))
}

export const getConstraintValue = (effectiveAuthz, constraintKey, fallback = null) => {
  const key = normalizeKey(constraintKey)
  if (!effectiveAuthz || !key) return fallback

  if (!Object.prototype.hasOwnProperty.call(effectiveAuthz.constraints || {}, key)) {
    return fallback
  }

  return effectiveAuthz.constraints[key]
}

export default {
  canRoute,
  canCapability,
  canAnyCapability,
  canAllCapabilities,
  getConstraintValue,
}
