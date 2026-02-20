/**
 * AuthZ normalization helpers
 */

import { AUTHZ_CAPABILITY_KEYS, AUTHZ_CONSTRAINT_KEYS, AUTHZ_ROUTE_KEYS } from "./authz.catalog.js"

const ROUTE_KEY_SET = new Set(AUTHZ_ROUTE_KEYS)
const CAPABILITY_KEY_SET = new Set(AUTHZ_CAPABILITY_KEYS)
const CONSTRAINT_KEY_SET = new Set(AUTHZ_CONSTRAINT_KEYS)

const uniqueStringArray = (value) => {
  if (!Array.isArray(value)) return []

  return [...new Set(
    value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
  )]
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

export const createEmptyAuthzOverride = () => ({
  allowRoutes: [],
  denyRoutes: [],
  allowCapabilities: [],
  denyCapabilities: [],
  constraints: [],
})

export const normalizeAuthzOverride = (input = {}) => {
  if (!input || typeof input !== "object") {
    return createEmptyAuthzOverride()
  }

  return {
    allowRoutes: uniqueStringArray(input.allowRoutes).filter((key) => ROUTE_KEY_SET.has(key)),
    denyRoutes: uniqueStringArray(input.denyRoutes).filter((key) => ROUTE_KEY_SET.has(key)),
    allowCapabilities: uniqueStringArray(input.allowCapabilities).filter(
      (key) => key === "*" || CAPABILITY_KEY_SET.has(key)
    ),
    denyCapabilities: uniqueStringArray(input.denyCapabilities).filter(
      (key) => key === "*" || CAPABILITY_KEY_SET.has(key)
    ),
    constraints: normalizeConstraintOverrides(input.constraints).filter((entry) => CONSTRAINT_KEY_SET.has(entry.key)),
  }
}

export default normalizeAuthzOverride
