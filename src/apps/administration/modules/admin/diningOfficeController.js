/**
 * Dining Office Controller
 * HTTP layer for managing Dining-role / Office sub-role logins.
 *
 * @module controllers/dining-office
 */

import {
  getAllDiningOfficeStaff as getAllDiningOfficeStaffService,
  createDiningOfficeStaff as createDiningOfficeStaffService,
  updateDiningOfficeStaff as updateDiningOfficeStaffService,
  deleteDiningOfficeStaff as deleteDiningOfficeStaffService,
} from "./dining-office.service.js"
import { asyncHandler } from "../../../../utils/index.js"

export const getAllDiningOfficeStaff = asyncHandler(async (req, res) => {
  const result = await getAllDiningOfficeStaffService()
  res.status(result.statusCode).json(result.data)
})

export const createDiningOfficeStaff = asyncHandler(async (req, res) => {
  const result = await createDiningOfficeStaffService(req.body)

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }

  res.status(result.statusCode).json({ message: result.message })
})

export const updateDiningOfficeStaff = asyncHandler(async (req, res) => {
  const result = await updateDiningOfficeStaffService(req.params.id, req.body)

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }

  res.status(result.statusCode).json({ message: result.message })
})

export const deleteDiningOfficeStaff = asyncHandler(async (req, res) => {
  const result = await deleteDiningOfficeStaffService(req.params.id)

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.message })
  }

  res.status(result.statusCode).json({ message: result.message })
})
