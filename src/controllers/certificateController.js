import { certificateService } from "../services/certificate.service.js"

export const addCertificate = async (req, res) => {
  const result = await certificateService.addCertificate(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const getCertificatesByStudent = async (req, res) => {
  const result = await certificateService.getCertificatesByStudent(req.params.studentId)
  if (!result.success) {
    return res.status(result.statusCode).json({
      success: false,
      message: result.message,
      error: result.error,
    })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateCertificate = async (req, res) => {
  const result = await certificateService.updateCertificate(req.params.certificateId, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteCertificate = async (req, res) => {
  const result = await certificateService.deleteCertificate(req.params.certificateId)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message, error: result.error })
  }
  res.status(result.statusCode).json(result.data)
}
