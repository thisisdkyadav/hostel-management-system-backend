# Backend AuthZ Agent Guide

## Current Model

Auth remains 3 layers:
1. `authenticate`
2. `authorizeRoles(...)` (legacy role gate, unchanged)
3. Layer-3 AuthZ (`requireRouteAccess`, optional capability/constraint)

Current rollout scope is intentionally narrow:
1. Route access is the primary dynamic control.
2. Only one capability is active in runtime code:
   - `cap.students.edit.personal`
3. Only one constraint is active in runtime code:
   - `constraint.complaints.scope.hostelIds`

Do not reintroduce legacy permission runtime (`/permissions`, `requirePermission`, `user.permissions`).

## Source Of Truth Files

1. Catalog: `src/core/authz/authz.catalog.js`
2. Middleware: `src/middlewares/authz.middleware.js`
3. AuthZ IAM APIs: `src/apps/iam/modules/authz/authz.routes.js`, `src/apps/iam/modules/authz/authz.service.js`
4. User override storage: `src/models/user/User.model.js` (`authz.override`, `authz.meta`)

## Enforcement Pattern

For protected endpoints, keep this order:
1. `authenticate`
2. `authorizeRoles([...])`
3. `requireRouteAccess("route.xxx")`
4. Optional capability middleware only if endpoint is part of the active pilot capability.

Today, only student personal edit endpoints in:
`src/apps/students/modules/profiles-admin/profiles-admin.routes.js`
use `requireAnyCapability(["cap.students.edit.personal"])`.

## Constraints Rule (Current)

Only complaints hostel scoping is active:
`constraint.complaints.scope.hostelIds`

Implemented in:
`src/apps/complaints/modules/complaints/complaints.service.js`

Other previously added constraint keys were intentionally removed and must stay removed until explicitly planned.

## Adding New Route-Level AuthZ

1. Add route key in `authz.catalog.js`.
2. Apply `requireRouteAccess(...)` in the route file.
3. Ensure superadmin authz UI/help text includes the new route.

## Re-introducing Capabilities Later

Do this only feature-by-feature:
1. Add capability key in `authz.catalog.js`.
2. Add backend middleware on exact sensitive endpoints.
3. Add frontend UI checks only where needed.
4. Document the capability in frontend + backend guides.
5. Do not bulk-add capabilities across modules.

## Re-introducing Constraints Later

Do this only where data scoping/limits are required:
1. Add constraint key in `authz.catalog.js`.
2. Enforce in service layer (not only route layer).
3. Add UI editing/help guidance in superadmin authz page.

## Guardrails

1. Keep hard-coded product boundaries unless explicitly changed.
2. Route access is mandatory for new sensitive routes.
3. Do not add wildcard capability behavior as a shortcut.
4. Keep keys consistent:
   - route: `route.<scope>.<feature>`
   - capability: `cap.<feature>.<action>`
   - constraint: `constraint.<feature>.<scope>`
