import { handler } from "../../../../lib/api-kit/index.js"
import {
  checkOnMachines,
  getMachinePhoto,
  getScannerPhoto,
  getScannerStats,
  getScannerUser,
  listScannerUsers,
  startProfilePhotoJob,
  tryProfilePhoto,
} from "../../../../services/dining/scanner-users.service.js"

export const list = handler((req) => listScannerUsers({ query: req.query }))
export const stats = handler(() => getScannerStats())
export const one = handler((req) => getScannerUser({ rollNumber: req.params.roll }))
export const profilePhoto = handler((req) => tryProfilePhoto({ rollNumber: req.params.roll, body: req.body, actor: req.user }))
export const profilePhotos = handler((req) => startProfilePhotoJob({ actor: req.user }))
export const machineCheck = handler((req) => checkOnMachines({ rollNumber: req.params.roll, actor: req.user }))

const sendImage = (res, file) => {
  res.set("Content-Type", file.contentType)
  res.set("Cache-Control", "private, max-age=300")
  res.set("X-Content-Type-Options", "nosniff")
  return res.send(file.buffer)
}

/** The photo a machine sent back for this student (?machine=<sn or alias>). */
export const machinePhoto = async (req, res, next) => {
  try {
    const file = await getMachinePhoto({ rollNumber: req.params.roll, machine: req.query.machine })
    if (!file) return res.status(404).json({ success: false, message: "No photo from this machine yet" })
    return sendImage(res, file)
  } catch (caught) {
    return next(caught)
  }
}

/** The scanner photo HMS keeps for this student (staff only; never cached publicly). */
export const photo = async (req, res, next) => {
  try {
    const file = await getScannerPhoto({ rollNumber: req.params.roll })
    if (!file) return res.status(404).json({ success: false, message: "No scanner photo" })
    return sendImage(res, file)
  } catch (caught) {
    return next(caught)
  }
}
