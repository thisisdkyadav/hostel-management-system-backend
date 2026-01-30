import { eventService } from "../services/event.service.js"

export const createEvent = async (req, res) => {
  const result = await eventService.createEvent(req.body, req.user)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const getEvents = async (req, res) => {
  const result = await eventService.getEvents(req.user)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const updateEvent = async (req, res) => {
  const result = await eventService.updateEvent(req.params.id, req.body)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}

export const deleteEvent = async (req, res) => {
  const result = await eventService.deleteEvent(req.params.id)
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }
  res.status(result.statusCode).json(result.data)
}
