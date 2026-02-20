/**
 * AuthZ merge helpers
 */

import {
  AUTHZ_CAPABILITY_DEFINITIONS,
  AUTHZ_CATALOG,
  AUTHZ_CONSTRAINT_DEFINITIONS,
  AUTHZ_ROUTE_KEYS_BY_ROLE,
} from "./authz.catalog.js"
import { AUTHZ_CATALOG_VERSION } from "./authz.constants.js"
import { normalizeAuthzOverride } from "./authz.normalize.js"

const buildDefaultConstraintMap = () => {
  return AUTHZ_CONSTRAINT_DEFINITIONS.reduce((acc, definition) => {
    acc[definition.key] = definition.defaultValue
    return acc
  }, {})
}

const buildDefaultRouteAccessMap = (role) => {
  const map = {}
  const allowedKeys = new Set(AUTHZ_ROUTE_KEYS_BY_ROLE[role] || [])

  for (const definition of AUTHZ_CATALOG.routes) {
    map[definition.key] = allowedKeys.has(definition.key)
  }

  return map
}

const buildDefaultCapabilityMap = (role) => {
  const map = {}
  const roleDefaults = AUTHZ_CATALOG.roleDefaults?.capabilities?.[role] || []
  const roleDenyDefaults = AUTHZ_CATALOG.roleDefaults?.denyCapabilities?.[role] || []
  const hasWildcard = roleDefaults.includes("*")
  const hasDenyWildcard = roleDenyDefaults.includes("*")

  map["*"] = hasWildcard && !hasDenyWildcard
  for (const definition of AUTHZ_CAPABILITY_DEFINITIONS) {
    const isAllowedByDefault = hasWildcard || roleDefaults.includes(definition.key)
    map[definition.key] = hasDenyWildcard ? false : isAllowedByDefault
  }

  if (!hasDenyWildcard) {
    for (const deniedCapabilityKey of roleDenyDefaults) {
      if (Object.prototype.hasOwnProperty.call(map, deniedCapabilityKey)) {
        map[deniedCapabilityKey] = false
      }
    }
  }

  return map
}

const applyRouteOverrides = (baseMap, override) => {
  for (const key of override.allowRoutes) {
    if (Object.prototype.hasOwnProperty.call(baseMap, key)) {
      baseMap[key] = true
    }
  }

  for (const key of override.denyRoutes) {
    if (Object.prototype.hasOwnProperty.call(baseMap, key)) {
      baseMap[key] = false
    }
  }

  return baseMap
}

const applyCapabilityOverrides = (baseMap, override) => {
  const capabilityKeys = Object.keys(baseMap).filter((key) => key !== "*")

  for (const key of override.allowCapabilities) {
    if (key === "*") {
      baseMap["*"] = true
      for (const capabilityKey of capabilityKeys) {
        baseMap[capabilityKey] = true
      }
      continue
    }

    if (Object.prototype.hasOwnProperty.call(baseMap, key)) {
      baseMap[key] = true
    }
  }

  for (const key of override.denyCapabilities) {
    if (key === "*") {
      baseMap["*"] = false
      for (const capabilityKey of capabilityKeys) {
        baseMap[capabilityKey] = false
      }
      continue
    }

    if (Object.prototype.hasOwnProperty.call(baseMap, key)) {
      baseMap[key] = false
    }
  }

  return baseMap
}

const applyConstraintOverrides = (baseMap, override) => {
  for (const entry of override.constraints) {
    baseMap[entry.key] = entry.value
  }

  return baseMap
}

export const buildEffectiveAuthz = ({ role, override = {} }) => {
  const normalizedOverride = normalizeAuthzOverride(override)

  const routeAccess = applyRouteOverrides(buildDefaultRouteAccessMap(role), normalizedOverride)
  const capabilities = applyCapabilityOverrides(buildDefaultCapabilityMap(role), normalizedOverride)
  const constraints = applyConstraintOverrides(buildDefaultConstraintMap(), normalizedOverride)

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

export default buildEffectiveAuthz
