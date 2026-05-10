import express from "express"
import { authenticate } from "../../../../middlewares/auth.middleware.js"
import { authorizeRoles } from "../../../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../../../middlewares/authz.middleware.js"
import { validate } from "../../../../middlewares/validate.middleware.js"
import { ROLES, SUBROLES } from "../../../../core/constants/roles.constants.js"
import * as controller from "./clubs.controller.js"
import * as validation from "./clubs.validation.js"

const router = express.Router()

router.use(authenticate)

const ROUTE_KEY_BY_ROLE = {
  [ROLES.ADMIN]: "route.admin.clubs",
  [ROLES.GYMKHANA]: "route.gymkhana.club",
}

const requireMappedRouteAccess = (req, res, next) => {
  const routeKey = ROUTE_KEY_BY_ROLE[req?.user?.role]
  if (!routeKey) return next()
  return requireRouteAccess(routeKey)(req, res, next)
}

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
  authorizeRoles([ROLES.GYMKHANA]),
  requireMappedRouteAccess,
  requireClubAccount,
  controller.getMyClub
)

router.get(
  "/",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  controller.listClubs
)

router.post(
  "/",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.createClubSchema),
  controller.createClub
)

router.put(
  "/:id",
  authorizeRoles([ROLES.ADMIN, ROLES.SUPER_ADMIN]),
  requireMappedRouteAccess,
  validate(validation.clubIdSchema, "params"),
  validate(validation.updateClubSchema),
  controller.updateClub
)

export default router
