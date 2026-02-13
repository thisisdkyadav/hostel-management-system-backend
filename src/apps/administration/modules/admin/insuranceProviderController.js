import { insuranceProviderService } from "./insuranceProvider.service.js"
import { asyncHandler } from "../../../../utils/index.js"

// Helper: Error format { message, error }
const sendResponse = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const createInsuranceProvider = asyncHandler(async (req, res) => {
  const result = await insuranceProviderService.createInsuranceProvider(req.body)
  sendResponse(res, result)
})

export const getInsuranceProviders = asyncHandler(async (req, res) => {
  const result = await insuranceProviderService.getInsuranceProviders()
  sendResponse(res, result)
})

export const updateInsuranceProvider = asyncHandler(async (req, res) => {
  const result = await insuranceProviderService.updateInsuranceProvider(req.params.id, req.body)
  sendResponse(res, result)
})

export const deleteInsuranceProvider = asyncHandler(async (req, res) => {
  const result = await insuranceProviderService.deleteInsuranceProvider(req.params.id)
  sendResponse(res, result)
})

export const updateBulkStudentInsurance = asyncHandler(async (req, res) => {
  const result = await insuranceProviderService.updateBulkStudentInsurance(req.body)
  sendResponse(res, result)
})
