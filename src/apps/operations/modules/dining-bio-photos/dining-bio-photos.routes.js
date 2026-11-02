import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { approve, list, reject } from "./dining-bio-photos.controller.js"

/**
 * Face-scanner bio-photo requests: Admin and the Dining Office review them.
 * Caterer logins (Dining/Caterer) are refused before authz.
 */
const guard = routeGuard({
  Admin: "route.admin.diningBioPhotos",
  Dining: "route.admin.diningBioPhotos",
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
router.post("/:id/approve", approve)
router.post("/:id/reject", reject)
export default router
