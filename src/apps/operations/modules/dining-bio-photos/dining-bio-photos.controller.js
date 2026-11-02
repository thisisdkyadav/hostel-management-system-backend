import { handler } from "../../../../lib/api-kit/index.js"
import {
  approveBioPhotoRequest,
  listBioPhotoRequests,
  rejectBioPhotoRequest,
} from "../../../../services/dining/bio-photo.service.js"

export const list = handler((req) => listBioPhotoRequests({ query: req.query }))
export const approve = handler((req) => approveBioPhotoRequest({ requestId: req.params.id, reviewer: req.user }))
export const reject = handler((req) => rejectBioPhotoRequest({ requestId: req.params.id, reviewer: req.user, body: req.body }))
