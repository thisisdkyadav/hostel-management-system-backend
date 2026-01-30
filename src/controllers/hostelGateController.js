import { hostelGateService } from "../services/hostelGate.service.js"

export const createHostelGate = async (req, res) => {
  const result = await hostelGateService.createHostelGate(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const getAllHostelGates = async (req, res) => {
  const result = await hostelGateService.getAllHostelGates()
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateHostelGate = async (req, res) => {
  const result = await hostelGateService.updateHostelGate(req.params.hostelId, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteHostelGate = async (req, res) => {
  const result = await hostelGateService.deleteHostelGate(req.params.hostelId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const getHostelGateProfile = async (req, res) => {
  const result = await hostelGateService.getHostelGateProfile(req.params.hostelId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}
