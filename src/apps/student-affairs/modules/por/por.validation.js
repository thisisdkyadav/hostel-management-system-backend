import Joi from "joi"
import { objectId } from "../../../../validations/common.validation.js"
import { POST_STUDENT_AFFAIRS_APPROVERS } from "../events/events.constants.js"

const requiredText = Joi.string().trim().min(2).max(500)
const optionalComment = Joi.string().trim().max(2000).allow("")

export const createPorRequestSchema = Joi.object({
  clubId: objectId.required(),
  hasDisciplinaryAction: Joi.boolean().required(),
  disciplinaryActionDetails: Joi.when("hasDisciplinaryAction", {
    is: true,
    then: Joi.string().trim().min(5).max(2000).required(),
    otherwise: Joi.string().trim().allow("").default(""),
  }),
  positionTitle: requiredText.required(),
  positionDetails: Joi.string().trim().min(5).max(4000).required(),
  tenure: requiredText.required(),
})

export const porRequestIdSchema = Joi.object({
  id: objectId.required(),
})

export const approvalActionSchema = Joi.object({
  comments: optionalComment.default(""),
  nextApprovalStages: Joi.array()
    .items(Joi.string().valid(...POST_STUDENT_AFFAIRS_APPROVERS))
    .default([]),
  nextApprovers: Joi.array()
    .items(
      Joi.object({
        stage: Joi.string().valid(...POST_STUDENT_AFFAIRS_APPROVERS).required(),
        userId: objectId.required(),
      })
    )
    .default([]),
})

export const rejectionSchema = Joi.object({
  reason: Joi.string().trim().min(3).max(2000).required(),
})

export const revisionSchema = Joi.object({
  comments: Joi.string().trim().min(3).max(2000).required(),
})

export default {
  createPorRequestSchema,
  porRequestIdSchema,
  approvalActionSchema,
  rejectionSchema,
  revisionSchema,
}
