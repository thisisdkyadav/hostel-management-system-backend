/**
 * AuthZ normalization helpers
 */

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
    allowRoutes: uniqueStringArray(input.allowRoutes),
    denyRoutes: uniqueStringArray(input.denyRoutes),
    allowCapabilities: uniqueStringArray(input.allowCapabilities),
    denyCapabilities: uniqueStringArray(input.denyCapabilities),
    constraints: normalizeConstraintOverrides(input.constraints),
  }
}

export default normalizeAuthzOverride
