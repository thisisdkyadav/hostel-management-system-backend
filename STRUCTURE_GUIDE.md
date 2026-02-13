# Backend Structure Guide

Purpose: current backend architecture reference for contributors and coding agents.
Last updated: February 13, 2026

## 1. Architecture Overview

The backend is a modular monolith:

- Shared infrastructure stays in `src/core`, `src/middlewares`, `src/models`, `src/services/base`, `src/utils`, and `src/validations`.
- Business domains are separated into app routers under `src/apps`.
- `src/loaders/express.loader.js` is the source of truth for runtime mount points.

## 2. Current Directory Layout

```text
backend/src/
├── app.js
├── server.js
├── config/
├── core/
├── loaders/
│   └── express.loader.js
├── middlewares/
├── models/
├── services/
│   └── base/
├── utils/
├── validations/
└── apps/
    ├── auth/
    │   └── modules/
    │       ├── auth/
    │       └── sso/
    ├── iam/
    │   └── modules/
    │       ├── users/
    │       └── permissions/
    ├── complaints/
    │   └── modules/
    │       └── complaints/
    ├── students/
    │   └── modules/
    │       ├── profiles-admin/
    │       ├── profiles-self/
    │       └── student-profile/
    ├── visitors/
    │   └── modules/
    │       └── visitors/
    ├── operations/
    │   └── modules/
    │       ├── tasks/
    │       ├── live-checkinout/
    │       ├── inventory/
    │       ├── staff-attendance/
    │       ├── hostel-rooms/
    │       ├── leave/
    │       ├── sheet/
    │       ├── online-users/
    │       ├── security/
    │       ├── face-scanner/
    │       ├── dashboard/
    │       └── stats/
    ├── campus-life/
    │   └── modules/
    │       ├── events/
    │       ├── lost-and-found/
    │       ├── feedback/
    │       ├── notifications/
    │       ├── undertakings/
    │       ├── disco/
    │       └── certificates/
    ├── administration/
    │   └── modules/
    │       ├── family/
    │       ├── config/
    │       ├── email/
    │       ├── upload/
    │       ├── super-admin/
    │       ├── warden/
    │       └── admin/
    └── student-affairs/
        └── modules/
            ├── grievance/
            ├── events/
            └── (future modules)
```

## 3. App Mount Points

Defined in `src/loaders/express.loader.js`:

| App | Mounted At | Owns |
|---|---|---|
| `auth` | `/api/v1` | `/auth/*`, `/sso/*` |
| `iam` | `/api/v1` | `/users/*`, `/permissions/*` |
| `complaints` | `/api/v1` | `/complaint/*` |
| `visitors` | `/api/v1` | `/visitor/*` |
| `operations` | `/api/v1` | `/tasks/*`, `/live-checkinout/*`, `/inventory/*`, `/staff/*`, `/hostel/*`, `/leave/*`, `/sheet/*`, `/online-users/*`, `/security/*`, `/face-scanner/*`, `/dashboard/*`, `/stats/*` |
| `campus-life` | `/api/v1` | `/event/*`, `/lost-and-found/*`, `/feedback/*`, `/notification/*`, `/undertaking/*`, `/disCo/*`, `/certificate/*` |
| `administration` | `/api/v1` | `/admin/*`, `/warden/*`, `/super-admin/*`, `/family/*`, `/config/*`, `/email/*`, `/upload/*`, `/health` (compatibility endpoint) |
| `students` | `/api/v1/students` | `/profile/*`, `/profiles-admin/*`, `/profiles-self/*` |
| `student-affairs` | `/api/v1/student-affairs` | `/grievances/*`, `/events/*` (current) |

Special non-v1 routes in loader:

- `/api/sso/verify` (special CORS handling)
- `/api/face-scanner/ping`
- `/api/face-scanner/scan`
- `/api/face-scanner/test-auth`

Global root health endpoints:

- `/health` (global server health)
- `/api/v1/health` (domain compatibility health route served by `administration`)

## 4. Domain Ownership Rules

- `apps/auth`: authentication/session/SSO flows.
- `apps/iam`: users and permissions (identity and access management).
- `apps/complaints`: complaint lifecycle.
- `apps/students`: student profile/admin/self flows.
- `apps/visitors`: visitor request/profile workflows.
- `apps/operations`: operational workflows and operational analytics.
- `apps/campus-life`: student-life/community workflows.
- `apps/administration`: cross-role administration workflows.
- `apps/student-affairs`: dedicated student-affairs domain.

Rule: new features must go to the owning app module. Do not recreate a generic `hostel` catch-all app.

## 5. Coding Pattern Expectations

### 5.1 Routes

- Use one route file per module: `<module>.routes.js`.
- Apply `authenticate` and role/permission guards in routes.
- Keep route ownership in the app that owns the domain.

### 5.2 Controllers

- Keep controllers thin and delegate business logic to services.
- Use shared async helpers (`asyncHandler`) and consistent response helpers.

### 5.3 Services

- Keep business logic and data coordination in services.
- Use `src/services/base/ServiceResponse.js` helpers (`success`, `badRequest`, `notFound`, etc.) for consistent contracts.

### 5.4 Models

- Define an index in one place only:
  - use field-level options (for example `unique: true`) **or**
  - use `Schema.index(...)`
- Do not define the same index in both places, to avoid duplicate-index warnings at startup.

## 6. Add New Work

### 6.1 Add Module To Existing App

1. Create `src/apps/<app>/modules/<module>/`.
2. Add at minimum:
   - `<module>.routes.js`
   - `<module>.controller.js`
   - `<module>.service.js`
   - `index.js`
3. Mount in `src/apps/<app>/index.js`.

### 6.2 Add New Major App

1. Create `src/apps/<new-app>/index.js` and module folders.
2. Mount app in `src/loaders/express.loader.js`.
3. Define canonical route prefix and ownership.
4. Keep backward compatibility only where active consumers require it.

## 7. Verification Checklist

Before merging refactor changes:

- Loader import sanity check passes:
  - `node -e "import('./src/loaders/express.loader.js')"`
- `git status` shows only expected changes.
- Changed frontend flows are manually validated.
- Any compatibility aliases slated for deletion were confirmed unused.
