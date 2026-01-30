import { superAdminService } from "../services/superAdmin.service.js"

export const createApiClient = async (req, res) => {
  const result = await superAdminService.createApiClient(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const getApiClients = async (req, res) => {
  const result = await superAdminService.getApiClients()
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteApiClient = async (req, res) => {
  const result = await superAdminService.deleteApiClient(req.params.clientId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateApiClient = async (req, res) => {
  const result = await superAdminService.updateApiClient(req.params.clientId, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const createAdmin = async (req, res) => {
  const result = await superAdminService.createAdmin(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const getAdmins = async (req, res) => {
  const result = await superAdminService.getAdmins()
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateAdmin = async (req, res) => {
  const result = await superAdminService.updateAdmin(req.params.adminId, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteAdmin = async (req, res) => {
  const result = await superAdminService.deleteAdmin(req.params.adminId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const getDashboardStats = async (req, res) => {
  const result = await superAdminService.getDashboardStats()
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}
