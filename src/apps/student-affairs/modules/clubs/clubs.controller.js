import { asyncHandler, sendStandardResponse } from "../../../../utils/index.js"
import { clubsService } from "./clubs.service.js"

export const listClubs = asyncHandler(async (_req, res) => {
  const result = await clubsService.listClubs()
  sendStandardResponse(res, result)
})

export const getMyClub = asyncHandler(async (req, res) => {
  const result = await clubsService.getMyClub(req.user)
  sendStandardResponse(res, result)
})

export const createClub = asyncHandler(async (req, res) => {
  const result = await clubsService.createClub(req.body)
  sendStandardResponse(res, result)
})

export const updateClub = asyncHandler(async (req, res) => {
  const result = await clubsService.updateClub(req.params.id, req.body)
  sendStandardResponse(res, result)
})

export default {
  listClubs,
  getMyClub,
  createClub,
  updateClub,
}
