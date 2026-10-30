import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { archive, bulkValues, create, list, setValue, students, update } from "./dining-tags.controller.js"

/**
 * Dining Tags management: Admin and the Dining Office. Both use the admin
 * route key; caterer logins (Dining/Caterer) are refused before authz.
 */
const guard = routeGuard({
  Admin: "route.admin.diningTags",
  Dining: "route.admin.diningTags",
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
router.post("/", create)
router.put("/:id", update)
router.put("/:id/archive", archive)
router.get("/:id/students", students)
router.post("/:id/students/bulk", bulkValues)
router.put("/:id/students/:studentUserId", setValue)
export default router
