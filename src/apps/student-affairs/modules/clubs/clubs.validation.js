import Joi from "joi"
import { email, name, objectId } from "../../../../validations/common.validation.js"

const gymkhanaCategoryKey = Joi.string().trim().min(1).max(100)

export const createClubSchema = Joi.object({
  name: name.required(),
  email: email.required(),
  gymkhanaCategoryKey: gymkhanaCategoryKey.required(),
})

export const updateClubSchema = Joi.object({
  name,
  email,
  gymkhanaCategoryKey,
}).min(1)

export const clubIdSchema = Joi.object({
  id: objectId.required(),
})

export default {
  createClubSchema,
  updateClubSchema,
  clubIdSchema,
}
