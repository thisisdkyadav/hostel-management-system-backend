import { insuranceProviderService } from "../services/insuranceProvider.service.js"

export const createInsuranceProvider = async (req, res) => {
  const result = await insuranceProviderService.createInsuranceProvider(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const getInsuranceProviders = async (req, res) => {
  const result = await insuranceProviderService.getInsuranceProviders()
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateInsuranceProvider = async (req, res) => {
  const result = await insuranceProviderService.updateInsuranceProvider(req.params.id, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteInsuranceProvider = async (req, res) => {
  const result = await insuranceProviderService.deleteInsuranceProvider(req.params.id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateBulkStudentInsurance = async (req, res) => {
  const result = await insuranceProviderService.updateBulkStudentInsurance(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}
