import {
  getCategoryLabelMap,
  normalizeCalendarCategoryDefinitions,
} from "./category-definitions.utils.js"

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString("en-IN")}`

export const normalizeCategoryBudgetCaps = (budgetCaps = {}, categoryDefinitions = []) => {
  const definitions = normalizeCalendarCategoryDefinitions(categoryDefinitions, { budgetCaps })

  return definitions.reduce((accumulator, definition) => {
    const category = definition.key
    const rawValue = budgetCaps?.[category]

    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      accumulator[category] = null
      return accumulator
    }

    const parsedValue = Number(rawValue)
    accumulator[category] = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null
    return accumulator
  }, {})
}

export const validateCategoryBudgetCaps = (events = [], budgetCaps = {}, categoryDefinitions = []) => {
  const definitions = normalizeCalendarCategoryDefinitions(categoryDefinitions, {
    events,
    budgetCaps,
  })
  const normalizedBudgetCaps = normalizeCategoryBudgetCaps(budgetCaps, definitions)
  const labels = getCategoryLabelMap(definitions)
  const totals = definitions.reduce((accumulator, definition) => {
    accumulator[definition.key] = 0
    return accumulator
  }, {})

  for (const event of events || []) {
    const category = event?.category
    if (!category || totals[category] === undefined) continue
    totals[category] += Number(event?.estimatedBudget || 0)
  }

  for (const definition of definitions) {
    const category = definition.key
    const cap = normalizedBudgetCaps[category]
    if (cap === null || cap === undefined) continue

    const total = totals[category]
    if (total > cap) {
      const label = labels[category] || category
      return {
        success: false,
        category,
        label,
        total,
        cap,
        message: `${label} category budget total ${formatCurrency(total)} exceeds the configured cap of ${formatCurrency(cap)}. Reduce the category budget or increase the cap in calendar settings.`,
      }
    }
  }

  return {
    success: true,
    totals,
    budgetCaps: normalizedBudgetCaps,
  }
}
