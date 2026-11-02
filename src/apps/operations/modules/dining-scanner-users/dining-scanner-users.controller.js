import { handler } from "../../../../lib/api-kit/index.js"
import {
  addScannerUser,
  getScannerPhoto,
  listScannerUsers,
  startProfilePhotoJob,
  startScannerSync,
  tryProfilePhoto,
} from "../../../../services/dining/scanner-users.service.js"

export const list = handler((req) => listScannerUsers({ query: req.query }))
export const add = handler((req) => addScannerUser({ body: req.body, actor: req.user }))
export const sync = handler(() => startScannerSync())
export const profilePhoto = handler((req) => tryProfilePhoto({ rollNumber: req.params.roll, body: req.body, actor: req.user }))
export const profilePhotos = handler((req) => startProfilePhotoJob({ actor: req.user }))

/** The scanner photo, proxied from EasyWDMS (staff only; never cached publicly). */
export const photo = async (req, res, next) => {
  try {
    const file = await getScannerPhoto({ rollNumber: req.params.roll })
    if (!file) return res.status(404).json({ success: false, message: "No scanner photo" })
    res.set("Content-Type", file.contentType)
    res.set("Cache-Control", "private, max-age=300")
    res.set("X-Content-Type-Options", "nosniff")
    return res.send(file.buffer)
  } catch (caught) {
    return next(caught)
  }
}
