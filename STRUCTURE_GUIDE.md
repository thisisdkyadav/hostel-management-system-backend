# Backend Structure Guide

Purpose: current backend architecture reference for contributors and coding agents.
Last updated: February 12, 2026

## 1. Architecture Overview

The backend is a modular monolith:

- Shared infrastructure stays in `src/core`, `src/middlewares`, `src/models`, `src/services/base`, `src/utils`, and `src/validations`.
- Business domains are separated into app routers under `src/apps`.
- `src/loaders/express.loader.js` is the source of truth for all mount points.

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
    ├── student-affairs/
    │   └── modules/
    │       ├── grievance/
    │       ├── events/
    │       └── (future modules)
    └── hostel/
        ├── routes/
        ├── controllers/
        └── services/
```

## 3. App Mount Points

Defined in `src/loaders/express.loader.js`:

| App | Mounted At | Owns |
|---|---|---|
| `auth` | `/api/v1` | `/auth/*`, `/sso/*` |
| `iam` | `/api/v1` | `/users/*`, `/permissions/*` |
| `complaints` | `/api/v1` | `/complaint/*` |
| `hostel` | `/api/v1` | legacy hostel management routes (`/student`, `/hostel`, `/warden`, etc.) |
| `students` | `/api/v1/students` | student domain modular routes |
| `student-affairs` | `/api/v1/student-affairs` | student affairs modules (grievance/events, etc.) |

Special non-v1 routes in loader:

- `/api/sso/verify` (special CORS handling)
- `/api/face-scanner/ping`
- `/api/face-scanner/scan`
- `/api/face-scanner/test-auth`

## 4. Domain Boundaries (Current)

- `apps/auth`: authentication sessions, login, password reset, SSO bridge.
- `apps/iam`: users and permissions (identity and access management).
- `apps/complaints`: complaint lifecycle, status, resolution notes, feedback.
- `apps/students`: student profile/admin/self flows.
- `apps/student-affairs`: separate domain for affairs workflows.
- `apps/hostel`: remaining legacy routes and compatibility surfaces during migration.

Rule: new auth/iam/students/complaints work should go to their own app, not back into `apps/hostel`.

## 5. Students App Structure

`src/apps/students/modules`:

- `profiles-admin`: admin/staff profile and directory operations.
- `profiles-self`: student-facing dashboard/profile/id-card flows.
- `student-profile`: student self-service profile/family/health endpoints.

Current route families:

- `/api/v1/students/profiles-admin/*`
- `/api/v1/students/profiles-self/*`
- `/api/v1/students/profile/*`

Compatibility notes:

- Hostel student endpoints (`/api/v1/student/*`) are still mounted for backward compatibility.
- Those legacy routes now import students module controllers directly (no hostel student wrapper layer).

## 6. Complaints App Structure

`src/apps/complaints/modules/complaints` is the canonical complaint module.

Canonical routes remain under:

- `/api/v1/complaint/*`

Legacy student-side complaint routes under hostel/student were removed after usage verification.

## 7. Coding Pattern Expectations

### 7.1 Routes

- Use route files per module: `<module>.routes.js`
- Apply `authenticate` and role/permission guards in routes.
- Keep route ownership inside the app that owns the domain.

### 7.2 Controllers

- Controllers stay thin and call services.
- Use `asyncHandler` and `sendRawResponse`.
- Avoid embedding heavy business rules in controllers.

### 7.3 Services

- Services hold business logic and data coordination.
- Reuse `src/services/base/ServiceResponse.js` helpers (`success`, `created`, `badRequest`, etc.) for consistent responses.
- Prefer module-local services inside each app.

## 8. Migration Rules

When moving legacy hostel code to a domain app:

1. Move module files to the target app (`routes`, `controller`, `service`).
2. Keep old route compatibility only if currently consumed.
3. Update frontend APIs to canonical routes when safe.
4. Remove wrappers/aliases only after verification.
5. Keep response shape stable during migration.

## 9. Adding New Work

### 9.1 Add Module To Existing App

1. Create `src/apps/<app>/modules/<module>/`.
2. Add at minimum:
   - `<module>.routes.js`
   - `<module>.controller.js`
   - `<module>.service.js`
   - `index.js`
3. Mount in `src/apps/<app>/index.js`.

### 9.2 Add New Major App

1. Create `src/apps/<new-app>/index.js` and module folders.
2. Mount app in `src/loaders/express.loader.js`.
3. Define canonical route prefix.
4. Move domain code from legacy hostel only with compatibility plan.

## 10. Verification Checklist

Before merging refactor changes:

- Loader import sanity check passes:
  - `node -e "import('./src/loaders/express.loader.js')"`
- `git status` shows only expected changes.
- Changed frontend flows are manually validated.
- Legacy aliases slated for deletion were confirmed unused.
