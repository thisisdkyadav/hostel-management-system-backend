import { lostAndFoundService } from "../services/lostAndFound.service.js"

export const createLostAndFound = async (req, res) => {
  const result = await lostAndFoundService.createLostAndFound(req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const getLostAndFound = async (req, res) => {
  const result = await lostAndFoundService.getLostAndFound()
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateLostAndFound = async (req, res) => {
  const result = await lostAndFoundService.updateLostAndFound(req.params.id, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteLostAndFound = async (req, res) => {
  const result = await lostAndFoundService.deleteLostAndFound(req.params.id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}
