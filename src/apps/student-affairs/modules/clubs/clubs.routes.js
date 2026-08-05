import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import { routeGuard } from "../../../../lib/api-kit/index.js"
import { ROLES, SUBROLES } from "../../../../core/constants/roles.constants.js"
import * as controller from "./clubs.controller.js"
import * as validation from "./clubs.validation.js"

const router = express.Router()

router.use(authenticate)

const guard = routeGuard(
  {
    [ROLES.ADMIN]: "route.admin.clubs",
    [ROLES.GYMKHANA]: "route.gymkhana.club",
  },
  { onUnmapped: "allow" }
)

const requireClubAccount = (req, res, next) => {
  if (req?.user?.role === ROLES.GYMKHANA && req?.user?.subRole === SUBROLES.CLUB) {
    return next()
  }

  return res.status(403).json({
    success: false,
    message: "Only club accounts can access this route",
    data: null,
    errors: null,
  })
}

router.get(
  "/me",
  guard([ROLES.GYMKHANA]),
  requireClubAccount,
  controller.getMyClub
)

router.get(
  "/",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  controller.listClubs
)

router.post(
  "/",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.createClubSchema),
  controller.createClub
)

router.put(
  "/:id",
  guard([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  validate(validation.clubIdSchema, "params"),
  validate(validation.updateClubSchema),
  controller.updateClub
)

export default router
