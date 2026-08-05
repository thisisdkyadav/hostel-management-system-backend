import { asyncHandler, sendStandardResponse } from "../../../../utils/index.js"
import { attendanceService } from "./attendance.service.js"

export const listOccurrences = asyncHandler(async (req, res) => {
  const result = await attendanceService.listOccurrences(req.user, req.query)
  sendStandardResponse(res, result)
})

export const getOccurrence = asyncHandler(async (req, res) => {
  const result = await attendanceService.getOccurrence(req.params.id, req.user)
  sendStandardResponse(res, result)
})

export const createOccurrence = asyncHandler(async (req, res) => {
  const result = await attendanceService.createOccurrence(req.body, req.user)
  sendStandardResponse(res, result)
})

export const updateOccurrence = asyncHandler(async (req, res) => {
  const result = await attendanceService.updateOccurrence(req.params.id, req.body, req.user)
  sendStandardResponse(res, result)
})

export const deleteOccurrence = asyncHandler(async (req, res) => {
  const result = await attendanceService.deleteOccurrence(req.params.id, req.user)
  sendStandardResponse(res, result)
})

export const uploadRoster = asyncHandler(async (req, res) => {
  const result = await attendanceService.uploadRoster(req.params.id, req.body.rollNumbers, req.user)
  sendStandardResponse(res, result)
})

export const scanAttendance = asyncHandler(async (req, res) => {
  const result = await attendanceService.scanAttendance(req.params.id, req.body, req.user)
  sendStandardResponse(res, result)
})

export const markAttendance = asyncHandler(async (req, res) => {
  const result = await attendanceService.markByRollNumber(req.params.id, req.body, req.user)
  sendStandardResponse(res, result)
})

export const deleteRecord = asyncHandler(async (req, res) => {
  const result = await attendanceService.deleteRecord(req.params.id, req.params.recordId, req.user)
  sendStandardResponse(res, result)
})

export default {
  listOccurrences,
  getOccurrence,
  createOccurrence,
  updateOccurrence,
  deleteOccurrence,
  uploadRoster,
  scanAttendance,
  markAttendance,
  deleteRecord,
}
