import { EVENT_CATEGORY } from "./events.constants.js"

export const CATEGORY_BUDGET_CAP_KEYS = Object.values(EVENT_CATEGORY)

export const CATEGORY_BUDGET_LABELS = {
  [EVENT_CATEGORY.ACADEMIC]: "Academic",
  [EVENT_CATEGORY.CULTURAL]: "Cultural",
  [EVENT_CATEGORY.SPORTS]: "Sports",
  [EVENT_CATEGORY.TECHNICAL]: "Technical",
}

const formatCurrency = (value) => `Rs ${Number(value || 0).toLocaleString("en-IN")}`

export const normalizeCategoryBudgetCaps = (budgetCaps = {}) =>
  CATEGORY_BUDGET_CAP_KEYS.reduce((accumulator, category) => {
    const rawValue = budgetCaps?.[category]

    if (rawValue === "" || rawValue === null || rawValue === undefined) {
      accumulator[category] = null
      return accumulator
    }

    const parsedValue = Number(rawValue)
    accumulator[category] = Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : null
    return accumulator
  }, {})

export const validateCategoryBudgetCaps = (events = [], budgetCaps = {}) => {
  const normalizedBudgetCaps = normalizeCategoryBudgetCaps(budgetCaps)
  const totals = CATEGORY_BUDGET_CAP_KEYS.reduce((accumulator, category) => {
    accumulator[category] = 0
    return accumulator
  }, {})

  for (const event of events || []) {
    const category = event?.category
    if (!CATEGORY_BUDGET_CAP_KEYS.includes(category)) continue
    totals[category] += Number(event?.estimatedBudget || 0)
  }

  for (const category of CATEGORY_BUDGET_CAP_KEYS) {
    const cap = normalizedBudgetCaps[category]
    if (cap === null || cap === undefined) continue

    const total = totals[category]
    if (total > cap) {
      const label = CATEGORY_BUDGET_LABELS[category] || category
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
