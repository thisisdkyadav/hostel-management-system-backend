import Configuration from "../../models/configuration.js"
import { defaultConfigs, getConfigWithDefault } from "../../utils/configDefaults.js"

// Get a specific configuration by key
export const getConfigurationByKey = async (req, res) => {
  try {
    const { key } = req.params

    // Use the utility function to get config with default fallback
    const config = await getConfigWithDefault(key)

    if (!config) {
      return res.status(404).json({ message: `Configuration with key '${key}' not found and no default exists` })
    }

    // Return only the value if specified
    if (req.query.valueOnly === "true") {
      return res.status(200).json(config.value)
    }

    // Return without MongoDB specific fields
    const configResponse = {
      key: config.key,
      value: config.value,
      description: config.description,
      lastUpdated: config.lastUpdated,
    }

    res.status(200).json(configResponse)
  } catch (error) {
    res.status(500).json({ message: "Error retrieving configuration", error: error.message })
  }
}

// Create or update a configuration
export const updateConfiguration = async (req, res) => {
  try {
    const { key } = req.params
    const { value, description } = req.body

    if (value === undefined) {
      return res.status(400).json({ message: "Configuration value is required" })
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

    res.status(200).json({
      message: `Configuration '${key}' updated successfully`,
      configuration: updatedConfig,
    })
  } catch (error) {
    res.status(500).json({ message: "Error updating configuration", error: error.message })
  }
}

// Reset a configuration to its default value
export const resetConfigurationToDefault = async (req, res) => {
  try {
    const { key } = req.params

    // Check if default exists for this key
    if (!defaultConfigs[key]) {
      return res.status(404).json({ message: `No default configuration exists for key '${key}'` })
    }

    const defaultConfig = {
      key,
      value: defaultConfigs[key].value,
      description: defaultConfigs[key].description,
      lastUpdated: Date.now(),
    }

    const updatedConfig = await Configuration.findOneAndUpdate({ key }, defaultConfig, { new: true, upsert: true })

    res.status(200).json({
      message: `Configuration '${key}' reset to default successfully`,
      configuration: updatedConfig,
    })
  } catch (error) {
    res.status(500).json({ message: "Error resetting configuration", error: error.message })
  }
}
