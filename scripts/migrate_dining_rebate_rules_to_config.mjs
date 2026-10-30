/**
 * Migration: move dining rebate rules from DiningPeriod.rebateSettings to the
 * global config `diningRebate` (Settings › Dining).
 *
 * Rebates are standalone now and the four short-term rules
 * (shortTermMaxTotalDays, shortTermMaxContinuousDays, shortTermMinApplicationDays,
 * shortTermMinAdvanceDays) live next to longTermFormRef/longTermFormName. When
 * the config value has no rule numbers yet, this copies them from the most
 * recent non-archived dining period (by startDate), else uses the defaults.
 * Existing form fields are kept. Rebate rows are NOT rewritten: legacy rows
 * attribute through their dateKeys + the student's allocation.
 *
 * Idempotent: a config that already has all four rule numbers is left alone.
 *
 *   node scripts/migrate_dining_rebate_rules_to_config.mjs            # dry run (report only)
 *   node scripts/migrate_dining_rebate_rules_to_config.mjs --apply    # write
 */

import mongoose from "mongoose"

import connectDatabase from "../src/config/database.config.js"
import Configuration from "../src/models/config/Configuration.model.js"
import DiningPeriod from "../src/models/dining/DiningPeriod.model.js"
import { DEFAULT_REBATE_RULES, DINING_REBATE_CONFIG_KEY, REBATE_RULE_KEYS, resolveRebateRules } from "../src/services/dining/rebateRules.js"

const APPLY = process.argv.includes("--apply") && !process.argv.includes("--dry-run")

const hasRule = (value, key) => value && value[key] !== undefined && value[key] !== null && value[key] !== ""

const run = async () => {
  await connectDatabase()
  console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY RUN"}\n`)
  try {
    const config = await Configuration.findOne({ key: DINING_REBATE_CONFIG_KEY }).lean()
    const currentValue = config?.value && typeof config.value === "object" ? config.value : {}

    if (REBATE_RULE_KEYS.every((key) => hasRule(currentValue, key))) {
      console.log("Config diningRebate already has all rebate rules — nothing to do.")
      console.log(resolveRebateRules(currentValue))
      return
    }

    const period = await DiningPeriod.findOne({ isArchived: false })
      .sort({ startDate: -1 })
      .select("_id startDate endDate rebateSettings")
      .lean()

    const source = period?.rebateSettings && typeof period.rebateSettings === "object" ? period.rebateSettings : null
    const sourceRules = source ? resolveRebateRules(source) : { ...DEFAULT_REBATE_RULES }
    console.log(source
      ? `Source: dining period ${period._id} (${period.startDate?.toISOString?.().slice(0, 10)} – ${period.endDate?.toISOString?.().slice(0, 10)})`
      : "Source: defaults (no non-archived dining period with rebate settings)")

    // Only fill rule numbers that are missing; keep any already set + the form fields.
    const rules = {}
    for (const key of REBATE_RULE_KEYS) {
      rules[key] = hasRule(currentValue, key) ? currentValue[key] : sourceRules[key]
    }
    const nextValue = {
      longTermFormRef: "",
      longTermFormName: "",
      ...currentValue,
      ...resolveRebateRules(rules),
    }

    console.log(`Config diningRebate ${config ? "update" : "create"}:`)
    console.log(nextValue)

    if (!APPLY) {
      console.log("\nDry run only. Re-run with --apply to write.")
      return
    }

    await Configuration.updateOne(
      { key: DINING_REBATE_CONFIG_KEY },
      {
        $set: { key: DINING_REBATE_CONFIG_KEY, value: nextValue, lastUpdated: new Date() },
        $setOnInsert: { description: "Dining rebate settings: global short-term rules and the blank long-term rebate form." },
      },
      { upsert: true },
    )
    console.log("\nDone.")
  } finally {
    await mongoose.disconnect()
  }
}

run().catch((error) => {
  console.error("Dining rebate rules migration failed:", error)
  mongoose.disconnect().finally(() => process.exit(1))
})
