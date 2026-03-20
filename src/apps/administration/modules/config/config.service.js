/**
 * Configuration Service
 * Handles system configuration operations
 * 
 * @module services/config.service
 */

import { Configuration, StudentProfile } from '../../../../models/index.js';
import { defaultConfigs, getConfigWithDefault } from '../../../../utils/configDefaults.js';
import { MIXED_BATCH_SCOPE_KEY, normalizeStudentBatchesConfig } from '../../../../utils/index.js';
import { BaseService, success, notFound, badRequest, error } from '../../../../services/base/index.js';

const ACADEMIC_HOLIDAYS_KEY = "academicHolidays"
const STUDENT_BATCHES_KEY = "studentBatches"
const STUDENT_GROUPS_KEY = "studentGroups"
const DEGREES_KEY = "degrees"
const DEPARTMENTS_KEY = "departments"
const YEAR_KEY_REGEX = /^\d{4}$/

const sortNames = (left, right) => left.localeCompare(right, undefined, { sensitivity: "base", numeric: true })

const normalizeHolidayDate = (value) => {
  if (!value) return null

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }
  return parsed.toISOString().slice(0, 10)
}

const normalizeAcademicHolidays = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { success: false, message: "academicHolidays must be an object keyed by year" }
  }

  const normalized = {}
  for (const [year, holidays] of Object.entries(value)) {
    if (!YEAR_KEY_REGEX.test(year)) {
      return { success: false, message: `Invalid year key '${year}'. Use YYYY format.` }
    }

    if (!Array.isArray(holidays)) {
      return { success: false, message: `Holiday list for year '${year}' must be an array` }
    }

    const dedupe = new Set()
    const normalizedHolidays = []
    for (let index = 0; index < holidays.length; index += 1) {
      const holiday = holidays[index]
      const title = String(holiday?.title || "").trim()
      const date = normalizeHolidayDate(holiday?.date)

      if (!title || !date) {
        return {
          success: false,
          message: `Invalid holiday at ${year}[${index}]. Each holiday needs non-empty title and valid date.`,
        }
      }

      const dedupeKey = `${date}|${title.toLowerCase()}`
      if (dedupe.has(dedupeKey)) continue
      dedupe.add(dedupeKey)

      normalizedHolidays.push({ title, date })
    }

    normalizedHolidays.sort((a, b) => {
      if (a.date === b.date) return a.title.localeCompare(b.title)
      return a.date.localeCompare(b.date)
    })

    normalized[year] = normalizedHolidays
  }

  return { success: true, value: normalized }
}

const containsReservedBatchScopeKey = (value = []) => (
  Array.isArray(value) && value.some((item) => String(item || "").trim() === MIXED_BATCH_SCOPE_KEY)
)

const normalizeStringList = (value, label) => {
  if (!Array.isArray(value)) {
    return { success: false, message: `${label} must be an array of strings` }
  }

  const seen = new Set()
  const normalized = []

  value.forEach((item) => {
    const nextValue = String(item || "").trim()
    if (!nextValue) return

    const lookupKey = nextValue.toLowerCase()
    if (seen.has(lookupKey)) return
    seen.add(lookupKey)
    normalized.push(nextValue)
  })

  normalized.sort(sortNames)
  return { success: true, value: normalized }
}

class ConfigService extends BaseService {
  constructor() {
    super(Configuration, 'Configuration');
  }

  /**
   * Get configuration by key
   * @param {string} key - Configuration key
   * @param {boolean} valueOnly - Return only the value
   */
  async getConfigurationByKey(key, valueOnly = false) {
    try {
      const config = await getConfigWithDefault(key);

      if (!config) {
        return notFound(`Configuration with key '${key}'`);
      }

      if (valueOnly) {
        return { success: true, statusCode: 200, data: config.value, valueOnly: true };
      }

      return success({
        key: config.key,
        value: config.value,
        description: config.description,
        lastUpdated: config.lastUpdated
      });
    } catch (err) {
      return error('Error retrieving configuration', 500, err.message);
    }
  }

  /**
   * Update configuration
   * @param {string} key - Configuration key
   * @param {Object} data - Update data with value and description
   */
  async updateConfiguration(key, data) {
    const { value, description } = data;

    if (value === undefined) {
      return badRequest('Configuration value is required');
    }

    let normalizedValue = value
    let previousConfig = null
    if (key === ACADEMIC_HOLIDAYS_KEY) {
      const normalizedHolidays = normalizeAcademicHolidays(value)
      if (!normalizedHolidays.success) {
        return badRequest(normalizedHolidays.message)
      }
      normalizedValue = normalizedHolidays.value
    } else if (key === STUDENT_BATCHES_KEY) {
      const normalizedStudentBatches = normalizeStudentBatchesConfig(value)
      if (!normalizedStudentBatches.success) {
        return badRequest(normalizedStudentBatches.message)
      }
      normalizedValue = normalizedStudentBatches.value
    } else if (key === DEGREES_KEY || key === DEPARTMENTS_KEY || key === STUDENT_GROUPS_KEY) {
      const normalizedList = normalizeStringList(value, key)
      if (!normalizedList.success) {
        return badRequest(normalizedList.message)
      }
      normalizedValue = normalizedList.value

      if ((key === DEGREES_KEY || key === DEPARTMENTS_KEY) && containsReservedBatchScopeKey(normalizedValue)) {
        return badRequest(`'${MIXED_BATCH_SCOPE_KEY}' is reserved for mixed batch scopes and cannot be used as a ${key === DEGREES_KEY ? 'degree' : 'department'} value`)
      }

      if (key === STUDENT_GROUPS_KEY) {
        previousConfig = await Configuration.findOne({ key })
      }
    }

    const result = await this.upsert(
      { key },
      {
        key,
        value: normalizedValue,
        description: description || defaultConfigs[key]?.description || '',
        lastUpdated: Date.now()
      }
    );

    if (result.success) {
      if (key === STUDENT_GROUPS_KEY) {
        const previousGroups = Array.isArray(previousConfig?.value) ? previousConfig.value : []
        const removedGroups = previousGroups.filter((group) => !normalizedValue.includes(group))

        if (removedGroups.length > 0) {
          await StudentProfile.updateMany(
            { groups: { $in: removedGroups } },
            { $pull: { groups: { $in: removedGroups } } }
          )
        }
      }

      return success({
        message: `Configuration '${key}' updated successfully`,
        configuration: result.data
      });
    }
    return result;
  }

  /**
   * Reset configuration to default value
   * @param {string} key - Configuration key
   */
  async resetConfigurationToDefault(key) {
    if (!defaultConfigs[key]) {
      return notFound(`No default configuration exists for key '${key}'`);
    }

    const result = await this.upsert(
      { key },
      {
        key,
        value: defaultConfigs[key].value,
        description: defaultConfigs[key].description,
        lastUpdated: Date.now()
      }
    );

    if (result.success) {
      return success({
        message: `Configuration '${key}' reset to default successfully`,
        configuration: result.data
      });
    }
    return result;
  }
}

export const configService = new ConfigService();
