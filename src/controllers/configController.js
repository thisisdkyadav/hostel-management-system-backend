import { configService } from "../services/config.service.js"

// Get a specific configuration by key
export const getConfigurationByKey = async (req, res) => {
  const result = await configService.getConfigurationByKey(req.params.key, req.query.valueOnly)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

// Create or update a configuration
export const updateConfiguration = async (req, res) => {
  const result = await configService.updateConfiguration(req.params.key, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

// Reset a configuration to its default value
export const resetConfigurationToDefault = async (req, res) => {
  const result = await configService.resetConfigurationToDefault(req.params.key)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}
