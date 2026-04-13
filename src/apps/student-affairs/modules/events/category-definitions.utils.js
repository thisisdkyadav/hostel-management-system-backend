import { EVENT_CATEGORY } from "./events.constants.js"
import { getConfigWithDefault } from "../../../../utils/configDefaults.js"

export const GYMKHANA_EVENT_CATEGORIES_CONFIG_KEY = "gymkhanaEventCategories"

export const DEFAULT_CATEGORY_DEFINITIONS = [
  { key: EVENT_CATEGORY.ACADEMIC, label: "Academic", isDefault: true },
  { key: EVENT_CATEGORY.CULTURAL, label: "Cultural", isDefault: true },
  { key: EVENT_CATEGORY.SPORTS, label: "Sports", isDefault: true },
  { key: EVENT_CATEGORY.TECHNICAL, label: "Technical", isDefault: true },
]

const DEFAULT_CATEGORY_KEY_SET = new Set(
  DEFAULT_CATEGORY_DEFINITIONS.map((definition) => definition.key)
)

const toCategoryLabel = (key = "") =>
  String(key)
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ")
    .trim() || "Category"

export const getDefaultCategoryDefinitions = () =>
  DEFAULT_CATEGORY_DEFINITIONS.map((definition) => ({ ...definition }))

export const isDefaultCategoryKey = (key) => DEFAULT_CATEGORY_KEY_SET.has(String(key || "").trim())

export const normalizeCategoryKey = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")

const normalizeCategoryLabel = (value = "", fallbackKey = "") => {
  const trimmed = String(value || "").trim()
  if (trimmed) return trimmed
  return toCategoryLabel(fallbackKey)
}

const getUniqueCategoryKey = (candidateKey, usedKeys) => {
  const normalizedCandidate = normalizeCategoryKey(candidateKey) || "category"
  if (!usedKeys.has(normalizedCandidate)) {
    return normalizedCandidate
  }

  let suffix = 2
  while (usedKeys.has(`${normalizedCandidate}_${suffix}`)) {
    suffix += 1
  }
  return `${normalizedCandidate}_${suffix}`
}

const normalizeDefinitionInput = (rawDefinition, usedKeys) => {
  const rawKey = normalizeCategoryKey(rawDefinition?.key || rawDefinition?.label)
  if (!rawKey) {
    return null
  }

  const isDefault = isDefaultCategoryKey(rawKey) || Boolean(rawDefinition?.isDefault)
  const key = isDefault || usedKeys.has(rawKey) ? rawKey : getUniqueCategoryKey(rawKey, usedKeys)
  usedKeys.add(key)

  return {
    key,
    label: normalizeCategoryLabel(rawDefinition?.label, key),
    isDefault,
  }
}

const upsertDefinition = (definitions, definitionsByKey, rawDefinition, usedKeys) => {
  const normalized = normalizeDefinitionInput(rawDefinition, usedKeys)
  if (!normalized) return

  if (definitionsByKey.has(normalized.key)) {
    const existing = definitionsByKey.get(normalized.key)
    existing.label = normalized.label
    existing.isDefault = normalized.isDefault
    return
  }

  definitions.push(normalized)
  definitionsByKey.set(normalized.key, normalized)
}

export const validateCategoryDefinitionsInput = (categoryDefinitions = []) => {
  if (categoryDefinitions === undefined) {
    return { success: true }
  }

  if (!Array.isArray(categoryDefinitions)) {
    return {
      success: false,
      message: "Category definitions must be provided as an array",
    }
  }

  const labels = new Set()
  for (const definition of categoryDefinitions) {
    if (!definition || typeof definition !== "object") {
      return {
        success: false,
        message: "Each category definition must be an object",
      }
    }

    const label = String(definition.label || "").trim()
    const key = normalizeCategoryKey(definition.key || definition.label)
    if (!label && !key) {
      return {
        success: false,
        message: "Each category must include a label",
      }
    }

    const normalizedLabel = label.toLowerCase()
    if (normalizedLabel) {
      if (labels.has(normalizedLabel)) {
        return {
          success: false,
          message: `Duplicate category label found: ${label}`,
        }
      }
      labels.add(normalizedLabel)
    }
  }

  return { success: true }
}

export const normalizeCalendarCategoryDefinitions = (
  categoryDefinitions = [],
  { existingDefinitions = [], events = [], budgetCaps = {} } = {}
) => {
  const definitions = []
  const definitionsByKey = new Map()
  const usedKeys = new Set()

  for (const definition of getDefaultCategoryDefinitions()) {
    upsertDefinition(definitions, definitionsByKey, definition, usedKeys)
  }

  for (const definition of existingDefinitions || []) {
    upsertDefinition(definitions, definitionsByKey, definition, usedKeys)
  }

  for (const definition of categoryDefinitions || []) {
    upsertDefinition(definitions, definitionsByKey, definition, usedKeys)
  }

  const discoveredCategories = [
    ...(Array.isArray(events) ? events.map((event) => event?.category) : []),
    ...Object.keys(budgetCaps || {}),
  ]

  for (const category of discoveredCategories) {
    const key = normalizeCategoryKey(category)
    if (!key || definitionsByKey.has(key)) continue
    definitions.push({
      key,
      label: toCategoryLabel(key),
      isDefault: isDefaultCategoryKey(key),
    })
    definitionsByKey.set(key, definitions[definitions.length - 1])
  }

  return definitions.map((definition) => ({ ...definition }))
}

export const getCategoryLabelMap = (categoryDefinitions = []) =>
  normalizeCalendarCategoryDefinitions(categoryDefinitions).reduce((labels, definition) => {
    labels[definition.key] = definition.label
    return labels
  }, {})

export const validateEventCategories = (events = [], categoryDefinitions = []) => {
  const knownKeys = new Set(
    normalizeCalendarCategoryDefinitions(categoryDefinitions).map((definition) => definition.key)
  )
  const invalidCategory = (events || []).find((event) => !knownKeys.has(String(event?.category || "").trim()))

  if (invalidCategory) {
    return {
      success: false,
      message: `Invalid category selected for event "${invalidCategory.title || "Untitled event"}"`,
    }
  }

  return { success: true }
}

export const getGlobalGymkhanaCategoryDefinitions = async ({
  calendar = null,
  events = [],
  budgetCaps = {},
} = {}) => {
  const config = await getConfigWithDefault(GYMKHANA_EVENT_CATEGORIES_CONFIG_KEY)
  const configuredDefinitions = Array.isArray(config?.value) ? config.value : []

  return normalizeCalendarCategoryDefinitions(configuredDefinitions, {
    existingDefinitions: calendar?.categoryDefinitions || [],
    events: events || calendar?.events || [],
    budgetCaps: budgetCaps || calendar?.budgetCaps || {},
  })
}
