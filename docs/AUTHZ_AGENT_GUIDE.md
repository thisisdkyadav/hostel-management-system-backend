# Backend AuthZ Agent Guide

## Purpose

This guide is for future coding agents working on backend authorization.

Current runtime authorization model:
1. Layer-1 RBAC: `authorizeRoles(...)` (kept intact).
2. Layer-3 AuthZ: route/capability/constraint checks.

Legacy permission runtime (`/permissions`, `requirePermission`, `user.permissions`) is retired and must not be reintroduced.

## Core Files (Backend)

1. Role constants:
   - `src/core/constants/roles.constants.js`
2. AuthZ catalog (source of truth):
   - `src/core/authz/authz.catalog.js`
3. AuthZ middleware:
   - `src/middlewares/authz.middleware.js`
4. AuthZ IAM APIs:
   - `src/apps/iam/modules/authz/authz.routes.js`
   - `src/apps/iam/modules/authz/authz.service.js`
5. User authz override model:
   - `src/models/user/User.model.js` (`authz.override`, `authz.meta`)
6. Env controls:
   - `src/config/env.config.js`
   - `.env`, `.env.example`

## Request Authorization Pattern (Required)

For protected backend endpoints, apply checks in this order:

1. `authenticate`
2. `authorizeRoles([...])`
3. `requireRouteAccess("route.xxx")` (or role-to-route-key mapper for shared modules)
4. `requireAnyCapability(["cap.xxx"])` (or `requireCapability`, `requireAllCapabilities` as needed)
5. Controller/service logic

Do not rely only on frontend hiding.

## Adding a New Feature (Backend)

When introducing a new module/endpoint:

1. Add route key(s) in `src/core/authz/authz.catalog.js` under `AUTHZ_ROUTE_DEFINITIONS`.
2. Add capability key(s) in `AUTHZ_CAPABILITY_DEFINITIONS`.
3. If needed, add constraint key(s) in `AUTHZ_CONSTRAINT_DEFINITIONS`.
4. Ensure defaults:
   - Route defaults are derived by role prefix from route keys.
   - Capability defaults are wildcard allow unless intentionally denied by role deny defaults.
5. Add middleware on routes:
   - `requireRouteAccess(...)`
   - `requireAnyCapability(...)`
6. If endpoint is multi-role shared, use a role->routeKey mapping helper in that route file.
7. Keep hard-coded business boundaries intact (do not relax admin-only behavior unless explicitly requested).

## Adding a New Role/User Type (Backend)

If a truly new role is introduced:

1. Add role constant in `src/core/constants/roles.constants.js`.
2. Add role to `User` schema enum in `src/models/user/User.model.js`.
3. Add route namespace/prefix plan in catalog:
   - create `route.newRole.*` entries.
4. Ensure `AUTHZ_ROUTE_KEYS_BY_ROLE` includes the new role prefix mapping.
5. If role needs default denies, add in `AUTHZ_CAPABILITY_DENY_DEFAULTS_BY_ROLE`.
6. Update route modules to include role in `authorizeRoles` where appropriate.
7. Add role-to-route-key mappings in shared route files if needed.

## Constraints Guidance

Use constraints only for scoped rules (not for identity checks), e.g.:
1. hostel-scoped access
2. field edit restrictions
3. amount limits

Enforce constraints in service/controller layer where data decisions are made.

## Env and Enforcement Controls

Key env variables:
1. `AUTHZ_MODE`: `off` | `observe` | `enforce`
2. `AUTHZ_ENFORCE_ROUTE_KEYS`
3. `AUTHZ_ENFORCE_CAPABILITY_KEYS`
4. `AUTHZ_OBSERVE_LOG_DENIES`

Recommended staged rollout:
1. Keep global mode `observe`.
2. Enforce migrated slices via enforce key lists.
3. Move to broader enforce only after runtime verification.

## Safety Rules for Agents

1. Do not add back legacy permission fields/endpoints/helpers.
2. Do not remove `authorizeRoles`.
3. Never grant capabilities that violate existing hard-coded role boundaries unless explicitly instructed.
4. Any new sensitive endpoint must have both route and capability checks.
5. Keep authz key naming consistent:
   - route: `route.<roleFamily>.<feature>`
   - capability: `cap.<feature>.<action>`
   - constraint: `constraint.<feature>.<scopeOrRule>`

## Quick Pre-Merge Checklist (Backend)

1. Route file has `authenticate + authorizeRoles + requireRouteAccess + capability guard`.
2. Catalog has keys for every new route/action.
3. Shared routes have deterministic role->route key mapping.
4. No usage of legacy permission runtime symbols:
   - `/permissions`
   - `requirePermission`
   - `user.permissions`
5. Docs/plans updated when adding new AuthZ scope.

