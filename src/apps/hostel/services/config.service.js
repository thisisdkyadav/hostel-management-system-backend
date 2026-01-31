/**
 * Configuration Service
 * Handles system configuration operations
 * 
 * @module services/config.service
 */

import { Configuration } from '../../../models/index.js';
import { defaultConfigs, getConfigWithDefault } from '../../../utils/configDefaults.js';
import { BaseService, success, notFound, badRequest, error } from '../../../services/base/index.js';

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

    const result = await this.upsert(
      { key },
      {
        key,
        value,
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
