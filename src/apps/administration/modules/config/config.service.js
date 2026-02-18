/**
 * Configuration Service
 * Handles system configuration operations
 * 
 * @module services/config.service
 */

import { Configuration } from '../../../../models/index.js';
import { defaultConfigs, getConfigWithDefault } from '../../../../utils/configDefaults.js';
import { BaseService, success, notFound, badRequest, error } from '../../../../services/base/index.js';

const ACADEMIC_HOLIDAYS_KEY = "academicHolidays"
const YEAR_KEY_REGEX = /^\d{4}$/

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
    if (key === ACADEMIC_HOLIDAYS_KEY) {
      const normalizedHolidays = normalizeAcademicHolidays(value)
      if (!normalizedHolidays.success) {
        return badRequest(normalizedHolidays.message)
      }
      normalizedValue = normalizedHolidays.value
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
