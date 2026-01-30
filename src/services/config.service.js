import Configuration from "../../models/configuration.js"
import { defaultConfigs, getConfigWithDefault } from "../../utils/configDefaults.js"

class ConfigService {
  async getConfigurationByKey(key, valueOnly = false) {
    try {
      // Use the utility function to get config with default fallback
      const config = await getConfigWithDefault(key)

      if (!config) {
        return { success: false, statusCode: 404, message: `Configuration with key '${key}' not found and no default exists` }
      }

      // Return only the value if specified
      if (valueOnly) {
        return { success: true, statusCode: 200, data: config.value, valueOnly: true }
      }

      // Return without MongoDB specific fields
      const configResponse = {
        key: config.key,
        value: config.value,
        description: config.description,
        lastUpdated: config.lastUpdated,
      }

      return { success: true, statusCode: 200, data: configResponse }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Error retrieving configuration", error: error.message }
    }
  }

  async updateConfiguration(key, data) {
    try {
      const { value, description } = data

      if (value === undefined) {
        return { success: false, statusCode: 400, message: "Configuration value is required" }
      }

      const updatedConfig = await Configuration.findOneAndUpdate(
        { key },
        {
          key,
          value,
          description: description || defaultConfigs[key]?.description || "",
          lastUpdated: Date.now(),
        },
        { new: true, upsert: true, runValidators: true }
      )

      return {
        success: true,
        statusCode: 200,
        data: {
          message: `Configuration '${key}' updated successfully`,
          configuration: updatedConfig,
        },
      }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Error updating configuration", error: error.message }
    }
  }

  async resetConfigurationToDefault(key) {
    try {
      // Check if default exists for this key
      if (!defaultConfigs[key]) {
        return { success: false, statusCode: 404, message: `No default configuration exists for key '${key}'` }
      }

      const defaultConfig = {
        key,
        value: defaultConfigs[key].value,
        description: defaultConfigs[key].description,
        lastUpdated: Date.now(),
      }

      const updatedConfig = await Configuration.findOneAndUpdate({ key }, defaultConfig, { new: true, upsert: true })

      return {
        success: true,
        statusCode: 200,
        data: {
          message: `Configuration '${key}' reset to default successfully`,
          configuration: updatedConfig,
        },
      }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Error resetting configuration", error: error.message }
    }
  }
}

export const configService = new ConfigService()
