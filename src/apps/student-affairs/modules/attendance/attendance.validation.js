import Joi from "joi"
import { objectId } from "../../../../validations/common.validation.js"
import { ATTENDANCE_STATUS, ATTENDANCE_SOURCE, MAX_ROSTER_SIZE } from "./attendance.constants.js"

const title = Joi.string().trim().min(2).max(200)
const description = Joi.string().trim().max(2000).allow("")
const location = Joi.string().trim().max(200).allow("")
const assignedUsers = Joi.array().items(objectId).max(200)

export const createOccurrenceSchema = Joi.object({
  title: title.required(),
  description: description.default(""),
  location: location.default(""),
  startAt: Joi.date().iso().optional(),
  assignedUsers: assignedUsers.default([]),
})

export const updateOccurrenceSchema = Joi.object({
  title,
  description,
  location,
  startAt: Joi.date().iso().allow(null),
  assignedUsers,
  status: Joi.string().valid(ATTENDANCE_STATUS.OPEN, ATTENDANCE_STATUS.CLOSED),
}).min(1)

export const occurrenceIdSchema = Joi.object({
  id: objectId.required(),
})

export const recordParamsSchema = Joi.object({
  id: objectId.required(),
  recordId: objectId.required(),
})

export const listQuerySchema = Joi.object({
  status: Joi.string().valid(ATTENDANCE_STATUS.OPEN, ATTENDANCE_STATUS.CLOSED),
  search: Joi.string().trim().max(200).allow(""),
})

export const rosterSchema = Joi.object({
  rollNumbers: Joi.array()
    .items(Joi.string().trim().max(50))
    .min(1)
    .max(MAX_ROSTER_SIZE)
    .required(),
})

export const scanSchema = Joi.object({
  email: Joi.string().trim().max(200).required(),
  encryptedData: Joi.string().max(5000).required(),
  source: Joi.string()
    .valid(ATTENDANCE_SOURCE.CAMERA, ATTENDANCE_SOURCE.SCANNER)
    .default(ATTENDANCE_SOURCE.CAMERA),
})

export const markSchema = Joi.object({
  rollNumber: Joi.string().trim().max(50).required(),
  source: Joi.string()
    .valid(ATTENDANCE_SOURCE.MANUAL, ATTENDANCE_SOURCE.SCANNER)
    .default(ATTENDANCE_SOURCE.MANUAL),
})

export default {
  createOccurrenceSchema,
  updateOccurrenceSchema,
  occurrenceIdSchema,
  recordParamsSchema,
  listQuerySchema,
  rosterSchema,
  scanSchema,
  markSchema,
}
