/**
 * routeGuard(routeKeyByRole) - role -> routeKey authorization guard factory
 *
 * Collapses the per-module boilerplate that is currently hand-rolled in 40+
 * route files:
 *
 *   const X_ROUTE_KEY_BY_ROLE = { [ROLES.ADMIN]: 'route.admin.x', ... }
 *   const requireXRouteAccess = (req, res, next) => {
 *     const routeKey = X_ROUTE_KEY_BY_ROLE[req?.user?.role]
 *     if (!routeKey) return res.status(403).json({ success: false, message: '...' })
 *     return requireRouteAccess(routeKey)(req, res, next)
 *   }
 *   router.post('/', authorizeRoles([...]), requireXRouteAccess, handler)
 *
 * Usage:
 *   const guard = routeGuard({
 *     Admin: 'route.admin.complaints',
 *     Warden: 'route.warden.complaints',
 *   })
 *   router.post('/', guard(['Admin', 'Warden']), createComplaint)
 *
 * `guard(roles)` returns `[authorizeRoles(roles), requireMappedRouteAccess]`.
 * Express flattens middleware arrays, so it drops straight into a route
 * definition. `requireMappedRouteAccess` resolves the routeKey for the
 * caller's role and enforces `requireRouteAccess`; an unmapped role -> 403.
 */
import { authorizeRoles } from "../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../middlewares/authz.middleware.js"

export const routeGuard = (routeKeyByRole = {}) => {
  const requireMappedRouteAccess = (req, res, next) => {
    const routeKey = routeKeyByRole[req?.user?.role]
    if (!routeKey) {
      return res.status(403).json({ success: false, message: "You do not have access to this route" })
    }
    return requireRouteAccess(routeKey)(req, res, next)
  }

  return (roles = []) => [authorizeRoles(roles), requireMappedRouteAccess]
}

export default routeGuard
