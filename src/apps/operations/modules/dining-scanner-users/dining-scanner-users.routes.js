import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { list, photo, profilePhoto, profilePhotos } from "./dining-scanner-users.controller.js"

/**
 * Scanner photos: each active student's face photo and whether every face
 * machine has it. Admin and the Dining Office. Caterer logins are refused before authz.
 */
const guard = routeGuard({
  Admin: "route.admin.diningScannerUsers",
  Dining: "route.admin.diningScannerUsers",
})
const officeOnly = (req, res, next) => {
  if (req.user?.role === "Dining" && req.user?.subRole !== "Office") {
    return res.status(403).json({ success: false, message: "You do not have access to this route" })
  }
  return next()
}

const router = express.Router()
router.use(authenticate)
router.use(guard(["Admin", "Dining"]))
router.use(officeOnly)
router.get("/", list)
router.post("/profile-photos", profilePhotos)
router.post("/:roll/profile-photo", profilePhoto)
router.get("/:roll/photo", photo)
export default router
