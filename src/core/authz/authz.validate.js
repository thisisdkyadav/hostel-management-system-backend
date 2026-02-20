/**
 * AuthZ validation helpers
 */

import {
  AUTHZ_CAPABILITY_DEFINITIONS,
  AUTHZ_CAPABILITY_KEYS,
  AUTHZ_CONSTRAINT_DEFINITIONS,
  AUTHZ_CONSTRAINT_KEYS,
  AUTHZ_ROUTE_KEYS,
} from "./authz.catalog.js"
import { AUTHZ_CONSTRAINT_TYPES } from "./authz.constants.js"
import { normalizeAuthzOverride } from "./authz.normalize.js"

const ROUTE_KEY_SET = new Set(AUTHZ_ROUTE_KEYS)
const CAPABILITY_KEY_SET = new Set(AUTHZ_CAPABILITY_KEYS)
const CONSTRAINT_KEY_SET = new Set(AUTHZ_CONSTRAINT_KEYS)

const CONSTRAINT_DEFINITION_MAP = new Map(
  AUTHZ_CONSTRAINT_DEFINITIONS.map((definition) => [definition.key, definition])
)

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

export const validateAuthzOverride = (input = {}) => {
  const normalized = normalizeAuthzOverride(input)
  const errors = [
    ...validateKeys(normalized.allowRoutes, ROUTE_KEY_SET, "allowRoutes"),
    ...validateKeys(normalized.denyRoutes, ROUTE_KEY_SET, "denyRoutes"),
    ...validateKeys(normalized.allowCapabilities, CAPABILITY_KEY_SET, "allowCapabilities", { allowWildcard: true }),
    ...validateKeys(normalized.denyCapabilities, CAPABILITY_KEY_SET, "denyCapabilities", { allowWildcard: true }),
  ]

  for (const entry of normalized.constraints) {
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

export const validateRouteKey = (key) => ROUTE_KEY_SET.has(key)
export const validateCapabilityKey = (key) => CAPABILITY_KEY_SET.has(key)
export const validateConstraintKey = (key) => CONSTRAINT_KEY_SET.has(key)

export const getCapabilityDefinition = (key) =>
  AUTHZ_CAPABILITY_DEFINITIONS.find((definition) => definition.key === key) || null

export default validateAuthzOverride
