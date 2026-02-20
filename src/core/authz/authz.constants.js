/**
 * AuthZ constants
 * Centralized constants for the third authorization layer.
 */

export const AUTHZ_MODES = {
  OFF: "off",
  OBSERVE: "observe",
  ENFORCE: "enforce",
}

export const AUTHZ_EFFECT = {
  ALLOW: "allow",
  DENY: "deny",
  INHERIT: "inherit",
}

export const AUTHZ_CONSTRAINT_TYPES = {
  BOOLEAN: "boolean",
  STRING: "string",
  STRING_ARRAY: "string[]",
  NUMBER: "number",
  NUMBER_ARRAY: "number[]",
  OBJECT: "object",
  ANY: "any",
}

export const AUTHZ_CATALOG_VERSION = 1

export const AUTHZ_DEFAULT_POLICY = AUTHZ_EFFECT.ALLOW

export default AUTHZ_MODES
