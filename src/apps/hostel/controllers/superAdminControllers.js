import { superAdminService } from "../services/superAdmin.service.js"
import { asyncHandler } from "../../../utils/index.js"

// Helper for error format { message, error }
const sendResponse = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const createApiClient = asyncHandler(async (req, res) => {
  const result = await superAdminService.createApiClient(req.body)
  sendResponse(res, result)
})

export const getApiClients = asyncHandler(async (req, res) => {
  const result = await superAdminService.getApiClients()
  sendResponse(res, result)
})

export const deleteApiClient = asyncHandler(async (req, res) => {
  const result = await superAdminService.deleteApiClient(req.params.clientId)
  sendResponse(res, result)
})

export const updateApiClient = asyncHandler(async (req, res) => {
  const result = await superAdminService.updateApiClient(req.params.clientId, req.body)
  sendResponse(res, result)
})

export const createAdmin = asyncHandler(async (req, res) => {
  const result = await superAdminService.createAdmin(req.body)
  sendResponse(res, result)
})

export const getAdmins = asyncHandler(async (req, res) => {
  const result = await superAdminService.getAdmins()
  sendResponse(res, result)
})

export const updateAdmin = asyncHandler(async (req, res) => {
  const result = await superAdminService.updateAdmin(req.params.adminId, req.body)
  sendResponse(res, result)
})

export const deleteAdmin = asyncHandler(async (req, res) => {
  const result = await superAdminService.deleteAdmin(req.params.adminId)
  sendResponse(res, result)
})

export const getDashboardStats = asyncHandler(async (req, res) => {
  const result = await superAdminService.getDashboardStats()
  sendResponse(res, result)
})
