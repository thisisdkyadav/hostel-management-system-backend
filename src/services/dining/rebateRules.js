/**
 * Global dining rebate rules (config key `diningRebate`, next to the long-term
 * form). Pure helpers: no DB access, so utils/config code can import them too.
 */

export const DINING_REBATE_CONFIG_KEY = "diningRebate"

/** How far ahead a rebate may go: the last rebate day is at most today + this many months. */
export const REBATE_MAX_ADVANCE_MONTHS = 6

export const DEFAULT_REBATE_RULES = Object.freeze({
  shortTermMaxTotalDays: 10,
  shortTermMaxContinuousDays: 3,
  shortTermMinApplicationDays: 1,
  shortTermMinAdvanceDays: 2,
})

export const REBATE_RULE_KEYS = Object.keys(DEFAULT_REBATE_RULES)

const RULE_MINIMUMS = {
  shortTermMaxTotalDays: 0,
  shortTermMaxContinuousDays: 1,
  shortTermMinApplicationDays: 1,
  shortTermMinAdvanceDays: 0,
}

const RULE_LABELS = {
  shortTermMaxTotalDays: "Max short-term days per dining period",
  shortTermMaxContinuousDays: "Max continuous short-term days",
  shortTermMinApplicationDays: "Min short-term days per request",
  shortTermMinAdvanceDays: "Min advance days for short-term",
}

const isBlank = (value) => value === undefined || value === null || value === ""

/**
 * Lenient read: the stored config value merged over the defaults. Bad or
 * missing numbers fall back to the default, so readers always get usable rules.
 */
export const resolveRebateRules = (value = {}) => {
  const source = value && typeof value === "object" ? value : {}
  const rules = {}
  for (const key of REBATE_RULE_KEYS) {
    const numeric = Number(source[key])
    rules[key] = !isBlank(source[key]) && Number.isInteger(numeric) && numeric >= RULE_MINIMUMS[key]
      ? numeric
      : DEFAULT_REBATE_RULES[key]
  }
  if (rules.shortTermMinApplicationDays > rules.shortTermMaxContinuousDays) {
    rules.shortTermMinApplicationDays = Math.min(DEFAULT_REBATE_RULES.shortTermMinApplicationDays, rules.shortTermMaxContinuousDays)
  }
  return rules
}

/**
 * Strict write validation for Settings › Dining. A rule left out keeps
 * `fallback` (the stored value, else the default); a rule that is sent must be
 * an integer within its bounds. Returns { value } or { error }.
 */
export const validateRebateRules = (value = {}, fallback = {}) => {
  const base = resolveRebateRules(fallback)
  const rules = {}
  for (const key of REBATE_RULE_KEYS) {
    if (isBlank(value?.[key])) {
      rules[key] = base[key]
      continue
    }
    const numeric = Number(value[key])
    if (!Number.isInteger(numeric)) return { error: `${RULE_LABELS[key]} must be a whole number` }
    if (numeric < RULE_MINIMUMS[key]) return { error: `${RULE_LABELS[key]} must be at least ${RULE_MINIMUMS[key]}` }
    rules[key] = numeric
  }
  if (rules.shortTermMinApplicationDays > rules.shortTermMaxContinuousDays) {
    return { error: "Minimum short-term rebate days cannot exceed the max continuous short-term days" }
  }
  return { value: rules }
}

export default {
  DINING_REBATE_CONFIG_KEY,
  REBATE_MAX_ADVANCE_MONTHS,
  DEFAULT_REBATE_RULES,
  REBATE_RULE_KEYS,
  resolveRebateRules,
  validateRebateRules,
}
