/**
 * routeGuard(routeKeyByRole, options) - role -> routeKey authorization guard
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
 *   router.post('/', authorizeRoles([...]), requireXRouteAccess, handler)   // paired
 *   router.get('/x', requireXRouteAccess, handler)                          // access-only
 *
 * Usage:
 *   const guard = routeGuard({
 *     Admin: 'route.admin.complaints',
 *     Warden: 'route.warden.complaints',
 *   })
 *   router.post('/', guard(['Admin', 'Warden']), createComplaint) // role gate + access
 *   router.get('/all', guard.access, getAllComplaints)            // access only
 *
 * - `guard(roles)` returns `[authorizeRoles(roles), access]`. Express flattens
 *   middleware arrays, so it drops straight into a route definition.
 * - `guard.access` is the mapped route-access middleware on its own, for routes
 *   that gate purely on route access (e.g. the role list is applied once via
 *   `router.use(authorizeRoles(...))` above).
 *
 * options.onUnmapped controls behaviour when the caller's role has no map key:
 *   - 'deny'  (default) -> 403 (matches the majority of existing wrappers)
 *   - 'allow'           -> next() (matches wrappers that fall through)
 */
import { authorizeRoles } from "../../middlewares/authorize.middleware.js"
import { requireRouteAccess } from "../../middlewares/authz.middleware.js"

export const routeGuard = (routeKeyByRole = {}, { onUnmapped = "deny" } = {}) => {
  const access = (req, res, next) => {
    const routeKey = routeKeyByRole[req?.user?.role]
    if (!routeKey) {
      if (onUnmapped === "allow") return next()
      return res.status(403).json({ success: false, message: "You do not have access to this route" })
    }
    return requireRouteAccess(routeKey)(req, res, next)
  }

  const guard = (roles = []) => [authorizeRoles(roles), access]
  guard.access = access
  return guard
}

export default routeGuard
