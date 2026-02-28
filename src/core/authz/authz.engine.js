/**
 * AuthZ engine
 * Single place for normalization, validation, merging, and evaluation.
 */

import {
  AUTHZ_CAPABILITY_DEFINITIONS,
  AUTHZ_CAPABILITY_KEYS,
  AUTHZ_CATALOG,
  AUTHZ_CATALOG_VERSION,
  AUTHZ_CONSTRAINT_DEFINITIONS,
  AUTHZ_CONSTRAINT_KEYS,
  AUTHZ_CONSTRAINT_TYPES,
  AUTHZ_ROUTE_KEYS,
  AUTHZ_ROUTE_KEYS_BY_ROLE,
} from "./authz.catalog.js"

const ROUTE_KEY_SET = new Set(AUTHZ_ROUTE_KEYS)
const CAPABILITY_KEY_SET = new Set(AUTHZ_CAPABILITY_KEYS)
const CONSTRAINT_KEY_SET = new Set(AUTHZ_CONSTRAINT_KEYS)

const CONSTRAINT_DEFINITION_MAP = new Map(
  AUTHZ_CONSTRAINT_DEFINITIONS.map((definition) => [definition.key, definition])
)

const normalizeKey = (value) => (typeof value === "string" ? value.trim() : "")

const uniqueStringArray = (value) => {
  if (!Array.isArray(value)) return []

  return [
    ...new Set(
      value
        .filter((item) => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ]
}

const normalizeConstraintOverrides = (value) => {
  if (!Array.isArray(value)) return []

  return value
    .filter((entry) => entry && typeof entry === "object" && typeof entry.key === "string")
    .map((entry) => ({
      key: entry.key.trim(),
      value: entry.value,
    }))
    .filter((entry) => entry.key.length > 0)
}

const isNumber = (value) => typeof value === "number" && Number.isFinite(value)
const isStringArray = (value) => Array.isArray(value) && value.every((item) => typeof item === "string")
const isNumberArray = (value) => Array.isArray(value) && value.every((item) => isNumber(item))
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value)

const validateConstraintValueType = (expectedType, value) => {
  switch (expectedType) {
    case AUTHZ_CONSTRAINT_TYPES.BOOLEAN:
      return typeof value === "boolean"
    case AUTHZ_CONSTRAINT_TYPES.STRING:
      return typeof value === "string"
    case AUTHZ_CONSTRAINT_TYPES.STRING_ARRAY:
      return isStringArray(value)
    case AUTHZ_CONSTRAINT_TYPES.NUMBER:
      return isNumber(value)
    case AUTHZ_CONSTRAINT_TYPES.NUMBER_ARRAY:
      return isNumberArray(value)
    case AUTHZ_CONSTRAINT_TYPES.OBJECT:
      return isObject(value)
    case AUTHZ_CONSTRAINT_TYPES.ANY:
      return true
    default:
      return false
  }
}

const validateKeys = (keys, keySet, bucketName, { allowWildcard = false } = {}) => {
  const invalidKeys = keys.filter((key) => !keySet.has(key) && !(allowWildcard && key === "*"))
  return invalidKeys.map((key) => ({
    field: bucketName,
    key,
    message: `Unknown ${bucketName} key: ${key}`,
  }))
}

const buildDefaultConstraintMap = () => {
  const defaults = {}
  for (const definition of AUTHZ_CONSTRAINT_DEFINITIONS) {
    defaults[definition.key] = definition.defaultValue
  }
  return defaults
}

const buildDefaultRouteAccessMap = (role) => {
  const defaults = {}
  const allowedKeys = new Set(AUTHZ_ROUTE_KEYS_BY_ROLE[role] || [])

  for (const definition of AUTHZ_CATALOG.routes) {
    defaults[definition.key] = allowedKeys.has(definition.key)
  }

  return defaults
}

const buildDefaultCapabilityMap = (role) => {
  const defaults = {}
  const roleDefaults = AUTHZ_CATALOG.roleDefaults?.capabilities?.[role] || []
  const roleDenyDefaults = AUTHZ_CATALOG.roleDefaults?.denyCapabilities?.[role] || []
  const hasAllowWildcard = roleDefaults.includes("*")
  const hasDenyWildcard = roleDenyDefaults.includes("*")

  defaults["*"] = hasAllowWildcard && !hasDenyWildcard

  for (const definition of AUTHZ_CAPABILITY_DEFINITIONS) {
    const isAllowedByDefault = hasAllowWildcard || roleDefaults.includes(definition.key)
    defaults[definition.key] = hasDenyWildcard ? false : isAllowedByDefault
  }

  if (!hasDenyWildcard) {
    for (const deniedCapabilityKey of roleDenyDefaults) {
      if (Object.prototype.hasOwnProperty.call(defaults, deniedCapabilityKey)) {
        defaults[deniedCapabilityKey] = false
      }
    }
  }

  return defaults
}

export const createEmptyAuthzOverride = () => ({
  allowRoutes: [],
  denyRoutes: [],
  allowCapabilities: [],
  denyCapabilities: [],
  constraints: [],
})

export const coerceAuthzOverrideInput = (input = {}) => {
  if (!input || typeof input !== "object") {
    return createEmptyAuthzOverride()
  }

  return {
    allowRoutes: uniqueStringArray(input.allowRoutes),
    denyRoutes: uniqueStringArray(input.denyRoutes),
    allowCapabilities: uniqueStringArray(input.allowCapabilities),
    denyCapabilities: uniqueStringArray(input.denyCapabilities),
    constraints: normalizeConstraintOverrides(input.constraints),
  }
}

export const normalizeAuthzOverride = (input = {}) => {
  const coerced = coerceAuthzOverrideInput(input)

  return {
    allowRoutes: coerced.allowRoutes.filter((key) => ROUTE_KEY_SET.has(key)),
    denyRoutes: coerced.denyRoutes.filter((key) => ROUTE_KEY_SET.has(key)),
    allowCapabilities: coerced.allowCapabilities.filter(
      (key) => key === "*" || CAPABILITY_KEY_SET.has(key)
    ),
    denyCapabilities: coerced.denyCapabilities.filter(
      (key) => key === "*" || CAPABILITY_KEY_SET.has(key)
    ),
    constraints: coerced.constraints.filter((entry) => CONSTRAINT_KEY_SET.has(entry.key)),
  }
}

export const validateAuthzOverride = (input = {}) => {
  const coerced = coerceAuthzOverrideInput(input)
  const normalized = normalizeAuthzOverride(input)
  const errors = [
    ...validateKeys(coerced.allowRoutes, ROUTE_KEY_SET, "allowRoutes"),
    ...validateKeys(coerced.denyRoutes, ROUTE_KEY_SET, "denyRoutes"),
    ...validateKeys(coerced.allowCapabilities, CAPABILITY_KEY_SET, "allowCapabilities", { allowWildcard: true }),
    ...validateKeys(coerced.denyCapabilities, CAPABILITY_KEY_SET, "denyCapabilities", { allowWildcard: true }),
  ]

  for (const entry of coerced.constraints) {
    if (!CONSTRAINT_KEY_SET.has(entry.key)) {
      errors.push({
        field: "constraints",
        key: entry.key,
        message: `Unknown constraint key: ${entry.key}`,
      })
      continue
    }

    const definition = CONSTRAINT_DEFINITION_MAP.get(entry.key)
    const isValidType = validateConstraintValueType(definition.valueType, entry.value)

    if (!isValidType) {
      errors.push({
        field: "constraints",
        key: entry.key,
        message: `Invalid value type for ${entry.key}. Expected ${definition.valueType}`,
      })
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    normalized,
  }
}

export const buildEffectiveAuthz = ({ role, override = {} }) => {
  const normalizedOverride = normalizeAuthzOverride(override)
  const routeAccess = buildDefaultRouteAccessMap(role)
  const capabilities = buildDefaultCapabilityMap(role)
  const constraints = buildDefaultConstraintMap()

  for (const key of normalizedOverride.allowRoutes) {
    if (Object.prototype.hasOwnProperty.call(routeAccess, key)) {
      routeAccess[key] = true
    }
  }
  for (const key of normalizedOverride.denyRoutes) {
    if (Object.prototype.hasOwnProperty.call(routeAccess, key)) {
      routeAccess[key] = false
    }
  }

  const capabilityKeys = Object.keys(capabilities).filter((key) => key !== "*")
  for (const key of normalizedOverride.allowCapabilities) {
    if (key === "*") {
      capabilities["*"] = true
      for (const capabilityKey of capabilityKeys) {
        capabilities[capabilityKey] = true
      }
      continue
    }
    if (Object.prototype.hasOwnProperty.call(capabilities, key)) {
      capabilities[key] = true
    }
  }
  for (const key of normalizedOverride.denyCapabilities) {
    if (key === "*") {
      capabilities["*"] = false
      for (const capabilityKey of capabilityKeys) {
        capabilities[capabilityKey] = false
      }
      continue
    }
    if (Object.prototype.hasOwnProperty.call(capabilities, key)) {
      capabilities[key] = false
    }
  }

  for (const entry of normalizedOverride.constraints) {
    if (Object.prototype.hasOwnProperty.call(constraints, entry.key)) {
      constraints[entry.key] = entry.value
    }
  }

  return {
    catalogVersion: AUTHZ_CATALOG_VERSION,
    role,
    routeAccess,
    capabilities,
    constraints,
  }
}

export const extractUserAuthzOverride = (userLike = {}) => {
  return normalizeAuthzOverride(userLike?.authz?.override || {})
}

export const buildEffectiveAuthzForUser = (userLike = {}) => {
  return buildEffectiveAuthz({
    role: userLike.role,
    override: extractUserAuthzOverride(userLike),
  })
}

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

export const validateRouteKey = (key) => ROUTE_KEY_SET.has(key)
export const validateCapabilityKey = (key) => CAPABILITY_KEY_SET.has(key)
export const validateConstraintKey = (key) => CONSTRAINT_KEY_SET.has(key)

export const getCapabilityDefinition = (key) =>
  AUTHZ_CAPABILITY_DEFINITIONS.find((definition) => definition.key === key) || null

export default {
  createEmptyAuthzOverride,
  coerceAuthzOverrideInput,
  normalizeAuthzOverride,
  validateAuthzOverride,
  buildEffectiveAuthz,
  extractUserAuthzOverride,
  buildEffectiveAuthzForUser,
  canRoute,
  canCapability,
  canAnyCapability,
  canAllCapabilities,
  getConstraintValue,
  validateRouteKey,
  validateCapabilityKey,
  validateConstraintKey,
  getCapabilityDefinition,
}
