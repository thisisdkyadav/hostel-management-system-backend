import { eventService } from './events.service.js';
import { asyncHandler } from '../../../../utils/index.js';

// Helper: Error format { message }
const sendResponse = (res, result) => {
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message });
  }
  res.status(result.statusCode).json(result.data);
};

export const createEvent = asyncHandler(async (req, res) => {
  const result = await eventService.createEvent(req.body, req.user);
  sendResponse(res, result);
});

export const getEvents = asyncHandler(async (req, res) => {
  const result = await eventService.getEvents(req.user, req.query);
  sendResponse(res, result);
});

export const updateEvent = asyncHandler(async (req, res) => {
  const result = await eventService.updateEvent(req.params.id, req.body);
  sendResponse(res, result);
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const result = await eventService.deleteEvent(req.params.id);
  sendResponse(res, result);
});
