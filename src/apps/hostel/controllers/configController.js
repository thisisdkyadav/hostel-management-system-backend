import { configService } from "../services/config.service.js"
import { asyncHandler } from "../../../utils/controllerHelpers.js"

/**
 * Helper: Error format with error field
 */
const sendWithError = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

// Get a specific configuration by key
export const getConfigurationByKey = asyncHandler(async (req, res) => {
  const result = await configService.getConfigurationByKey(req.params.key, req.query.valueOnly)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
})

// Create or update a configuration
export const updateConfiguration = asyncHandler(async (req, res) => {
  const result = await configService.updateConfiguration(req.params.key, req.body)
  sendWithError(res, result)
})

// Reset a configuration to its default value
export const resetConfigurationToDefault = asyncHandler(async (req, res) => {
  const result = await configService.resetConfigurationToDefault(req.params.key)
  sendWithError(res, result)
})
