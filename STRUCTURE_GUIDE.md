# Backend Structure Guide

Purpose: current backend architecture reference for contributors and coding agents.
Last updated: August 9, 2026

> **This is THE backend doc — the single source of truth.** Setup, structure,
> conventions, the model-ownership rules, authorization, design principles, and history
> all live in this one file, on purpose, so there is exactly one doc to maintain.
> **New rules go here.** Older scattered docs (`BACKEND_EVOLUTION.md`,
> `MODULAR_ARCHITECTURE_PLAN.md`, `structure_design.md`, `src/README.md`, and
> `docs/AUTHZ_AGENT_GUIDE.md`) have been folded in here and removed.

## Quick Start

**Prerequisites:** Node.js 18+ (works on 24) · MongoDB 5+ **as a replica set** (required for the transactions in §6.7 — e.g. `...?replicaSet=rs0`) · Redis (optional, for Socket.IO scaling).

```bash
npm install
cp .env.example .env      # then fill it in — .env.example lists every variable (required: MONGO_URI, SESSION_SECRET)
npm run dev               # hot-reload dev server (nodemon); use `npm start` for production
```

Before pushing, run the checks in §8 — above all `npm run check:boundary`.

## 1. Architecture Overview

The backend is a **modular monolith** (Node ESM + Express + Mongoose 9):

- Shared infrastructure lives in `src/core`, `src/middlewares`, `src/models`, `src/services/base`, `src/lib`, `src/utils`, and `src/validations`.
- Business domains are separated into app routers under `src/apps`.
- **All database access is owned by the service layer** under `src/services/<domain>/` — see §6. This is the most important invariant in the codebase and is machine-enforced (`npm run check:boundary`).
- `src/loaders/express.loader.js` is the source of truth for runtime mount points.

There are **two distinct senses of "ownership"** in this codebase, and they are orthogonal:

| Kind | Question it answers | Where it's defined | Section |
|---|---|---|---|
| **App ownership** | Which app module owns a *feature / HTTP route*? | `src/apps/<area>/modules/<feature>/` | §4 |
| **Data (model) ownership** | Which service owns *read/write access to a Mongoose model*? | `src/services/<domain>/<domain>Owner` + `Queries` | §6 |

A single request crosses both: an app module handles the HTTP feature, and it reaches the database **only** through the domain's owner/queries services.

### Request pipeline (end to end)

```
HTTP request
  → src/loaders/express.loader.js            (mounts app routers under /api/v1[/<area>])
  → src/apps/<area>/index.js                 (composes the area's module routers)
  → <feature>.routes.js                       authenticate → authz (routeGuard)
  → <feature>.controller.js                   thin adapter (handler() | asyncHandler)
  → <feature>.service.js  (APP service)       business logic + ServiceResponse envelope
  → <domain>Owner / <domain>Queries           THE ONLY place a Mongoose model is touched
  → Mongoose model
```

## 2. Current Directory Layout

```text
backend/
├── package.json                 # scripts: start, dev, migrate:*, check:boundary, test(placeholder)
├── scripts/
│   ├── check-model-boundary.mjs # the model-ownership guardrail (npm run check:boundary)
│   └── migrate_*.mjs / *.mjs     # one-off migrations & reconcilers
└── src/
    ├── app.js
    ├── server.js
    ├── config/
    ├── core/                    # constants, authz helpers, cross-cutting core
    ├── lib/
    │   └── api-kit/             # handler.js, routeGuard.js, index.js (Express spine)
    ├── loaders/
    │   └── express.loader.js    # SOURCE OF TRUTH for mount points
    ├── middlewares/             # auth.middleware, authorize.middleware, authz.middleware, ...
    ├── models/                  # Mongoose models, grouped by domain
    │   ├── index.js             # barrel: export * from every domain index
    │   └── <domain>/            # e.g. dining/ → DiningPeriod.model.js + index.js (+ enum consts)
    ├── services/                # THE DATA-OWNERSHIP LAYER (see §6)
    │   ├── base/                # ServiceResponse, TransactionHelper, PopulatePresets, QueryBuilder, Logger
    │   ├── <domain>/            # <domain>Owner.service.js (writes) + <domain>Queries.service.js (reads)
    │   │                        #   e.g. dining/, complaint/, disco/, elections/, user/, hostel/, ...
    │   ├── action-links/        # legacy single-file owner (allowlisted)
    │   ├── audit/               # legacy single-file owner (allowlisted)
    │   ├── cache/ email/ lock/ session/ storage/   # infra-only (no model access)
    │   └── index.js             # re-exports base only; domain services imported by full path
    ├── utils/
    ├── validations/
    └── apps/                    # THE FEATURE/ROUTE LAYER (8 areas)
        ├── administration/  ├── campus-life/  ├── complaints/  ├── iam/
        ├── operations/      ├── student-affairs/  ├── students/  └── visitors/
            └── modules/<feature>/
                ├── <feature>.routes.js       # authenticate + authz wiring
                ├── <feature>.controller.js   # thin HTTP adapter
                ├── <feature>.service.js       # APP service (business logic + envelopes)
                └── index.js
```

There is **no** `src/routes/`, `src/external/`, or backend-root legacy re-export directory anymore — all removed. Older docs that mention them are stale.

## 3. App Mount Points

Defined in `src/loaders/express.loader.js`. There is **no separate `auth` app** — identity/users are served by `iam`, and primary authentication / session / SSO issuance is handled by the Go backend (`/api/sso/verify` remains as a transitional verify endpoint with special CORS).

| App | Mounted At | Owns (examples) |
|---|---|---|
| `iam` | `/api/v1` | `/users/*`, `/authz/*` |
| `complaints` | `/api/v1` | `/complaint/*` |
| `visitors` | `/api/v1` | `/visitor/*` |
| `operations` | `/api/v1` | `/tasks/*`, `/live-checkinout/*`, `/inventory/*`, `/staff/*`, `/hostel/*`, `/leave/*`, `/security/*`, `/face-scanner/*`, `/dashboard/*`, `/stats/*` |
| `campus-life` | `/api/v1` | `/event/*`, `/lost-and-found/*`, `/feedback/*`, `/notification/*`, `/undertaking/*`, `/disCo/*`, `/certificate/*` |
| `administration` | `/api/v1` | `/admin/*`, `/warden/*`, `/super-admin/*`, `/family/*`, `/config/*`, `/email/*`, `/upload/*`, `/health` (compat) |
| `students` | `/api/v1/students` | `/profile/*`, `/profiles-admin/*`, `/profiles-self/*`, `/dining/*` |
| `student-affairs` | `/api/v1/student-affairs` | `/grievances/*`, `/events/*`, `/elections/*`, `/attendance/*`, `/best-performer/*` |

Special / non-`/api/v1` routes in the loader: `/api/sso/verify`, `/api/face-scanner/ping`, `/api/face-scanner/scan`, `/api/face-scanner/test-auth`. Health: `/health` (global) and `/api/v1/health` (compat, served by `administration`).

## 4. App Ownership Rules

*(Feature/route ownership — for model/data ownership see §6.)*

- `iam`: users and authz (identity and access management).
- `complaints`: complaint lifecycle.
- `students`: student profile/admin/self flows (+ student-facing dining).
- `visitors`: visitor request/profile workflows.
- `operations`: operational workflows and operational analytics.
- `campus-life`: student-life/community workflows.
- `administration`: cross-role administration workflows.
- `student-affairs`: dedicated student-affairs domain (grievance, events, elections, attendance, best-performer).

**Rule:** new features go to the owning app module. Do not recreate a generic `hostel` catch-all app.

## 5. Coding Pattern Expectations

### 5.1 Routes (`<feature>.routes.js`)

- One route file per module.
- Apply `authenticate` (from `middlewares/auth.middleware.js`) and authorization **in the route file**, never inside controllers. Public (no-auth) routes must be declared **before** `router.use(authenticate)`.
- Prefer **`routeGuard`** from `lib/api-kit` for authorization: build one role→routeKey map, then apply per route. The raw `authorizeRoles([...]) + requireRouteAccess('route.key')` pair is the legacy form and is still valid, but `routeGuard` is preferred for new code (adopted in ~35 route files).

```js
import { routeGuard } from '../../../../lib/api-kit/index.js';

const guard = routeGuard({
  [ROLES.ADMIN]:   'route.admin.complaints',
  [ROLES.WARDEN]:  'route.warden.complaints',
  [ROLES.STUDENT]: 'route.student.complaints',
});

router.get('/feedback/:token', getComplaintByToken); // PUBLIC — before authenticate
router.use(authenticate);                            // everything below is protected
router.post('/', guard(['Admin', 'Warden', 'Student']), createComplaint);
```

### 5.2 Controllers (`<feature>.controller.js`)

- Keep controllers thin: pull inputs off `req`, call **one** app-service method, translate the returned `ServiceResponse` into the HTTP response. No business logic, no model access.
- Two styles coexist:
  - **Modern:** wrap the handler in `handler()` from `lib/api-kit` — the service returns a `ServiceResponse` and the adapter emits the standard envelope. (Currently adopted only in the `complaints` controller.)
  - **Common/legacy:** `asyncHandler(async (req, res) => { const result = await service(...); res.status(result.statusCode).json({ success, message, data }); })`.
- When editing an existing module, **match that module's existing style**.

```js
// modern (handler)
export const getComplaintById = handler((req) =>
  complaintService.getComplaintById(req.params.id, req.user)
);
```

### 5.3 App Services (`<feature>.service.js`)

- Hold **business logic, permission/scope checks, and response shaping**; return `ServiceResponse` envelopes via helpers from `services/base/index.js` (`success`, `created`, `notFound`, `badRequest`, `forbidden`, `conflict`, `paginated`, `error`).
- **Never import a Mongoose model.** All DB access goes through the domain's owner/queries services (§6). This is enforced by `npm run check:boundary`.
- Dominant shape is a singleton class exported as `export const xService = new XService()`; a minority export standalone async functions. Both are fine.

```js
async updateFeedback(complaintId, userId, feedbackData) {
  const existing = await complaintQueries.findComplaintById(complaintId);   // read
  if (!existing) return notFound('Complaint not found');
  if (existing.userId.toString() !== userId.toString())
    return forbidden('Not authorized to update this feedback');
  const complaint = await complaintOwner.updateComplaintById(complaintId, feedbackData); // write
  return success(complaint);
}
```

### 5.4 Models (`src/models/<domain>/`)

- Define each index in **one** place only — either a field-level option (`unique: true`) **or** `Schema.index(...)`, never both (avoids duplicate-index warnings at startup).
- Model files may also export **constant enums** (e.g. `PAYMENT_STATUS`, `ACCOMMODATION_STATUS`, `MANUAL_ROOM_STATUSES`). Importing those enums anywhere is fine — it is **not** model access (see §6.6).

## 6. Service Layer & the Model-Ownership Boundary

**The invariant:** every Mongoose model access — reads *and* writes — lives in a per-domain owner/queries service under `src/services/<domain>/`. No other file in the codebase may import or touch a model. This makes data access auditable (one place per collection) and is **machine-enforced** by `npm run check:boundary` (§6.6).

### 6.1 owner vs queries

Each domain splits model access into two sibling files:

- **`<domain>Owner.service.js`** — ALL writes: `create`, `save`, `findByIdAndUpdate`, `updateOne/Many`, `insertMany`, `bulkWrite`, `deleteOne`, …
- **`<domain>Queries.service.js`** — ALL reads: `find`, `findOne`, `findById`, `countDocuments`, `aggregate`, `distinct`, …

Both are **plain object literals** — never classes, never `extends BaseService` — and they import models **only** from the barrel `../../models/index.js`. They return **raw** Mongoose values (hydrated docs, `null`, queries, `insertMany` output) — **never** a `ServiceResponse`.

```js
// diningOwner.service.js — writes only
import { Caterer, DiningRebate } from "../../models/index.js"
export const diningOwner = {
  async createCaterer(data) { return Caterer.create(data) },
  async updateCatererById(id, updates, options = {}) { return Caterer.findByIdAndUpdate(id, updates, options) },
  async persistRebate(doc) { return doc.save() },   // mutate-then-save
}
export default diningOwner
```

```js
// complaintQueries.service.js — reads only
import { Complaint, FeedbackToken } from "../../models/index.js"
export const complaintQueries = {
  async countComplaints(filter = {}) { return Complaint.countDocuments(filter) },
  async findComplaintById(id) { return Complaint.findById(id) },
}
```

### 6.2 repository-style vs named-domain methods

- **Repository-style** (when a collection is queried many ways): the caller builds the filter, options are conditionally chained. Signature `(filter, { select, lean, sort, limit, populate, session } = {})`. Include only the knobs that collection actually needs.

  ```js
  async findOnePeriod(filter, { select, lean, sort, populate, session } = {}) {
    let query = DiningPeriod.findOne(filter)
    if (select) query = query.select(select)
    if (populate) query = query.populate(populate)
    if (sort) query = query.sort(sort)
    if (session) query = query.session(session)
    if (lean) query = query.lean()
    return query
  }
  ```

- **Named-domain** (when the operation has a fixed, meaningful shape — a canonical populate, create-if-missing, a specific hydrated-vs-lean choice). Define canonical populate shapes **once** as a module-const array + helper at the top of the queries file:

  ```js
  const REBATE_POPULATE = [
    { path: "periodId", select: "startDate endDate rebateSettings" },
    { path: "catererId", select: "name email" },
    { path: "studentProfileId", select: "rollNumber userId", populate: { path: "userId", select: "name email" } },
  ]
  const populateRebate = (q) => { REBATE_POPULATE.forEach((p) => { q = q.populate(p) }); return q }
  async findRebateByIdPopulated(id, { lean } = {}) {
    let query = populateRebate(DiningRebate.findById(id))
    if (lean) query = query.lean()
    return query
  }
  ```

### 6.3 Granularity: one pair per domain

Combine the related collections of a domain into **ONE** owner + **ONE** queries — do **not** make per-collection files. Distinguish collections by model-qualified method names (`updateActionById` vs `updateProcessCaseById`; `createCaterer` vs `createPeriod`). A multi-model role family may instead key methods by a `roleKey` model-name lookup (see `staffRolesOwner`). Apply this to **new** domains; several older domains (dining, gymkhana, award, club, certificate) still have multiple pairs from earlier per-collection work — leave them; don't churn.

### 6.4 The envelope boundary (app service vs owner/queries)

| | owner/queries (`src/services/<domain>/`) | app service (`src/apps/.../*.service.js`) |
|---|---|---|
| Imports models? | **Yes — the only place** | Never |
| Contains | model calls, populate presets, lean/hydrated variants | business rules, permission/scope checks, serialization |
| Returns | raw docs / null / counts / queries | `ServiceResponse` envelope |
| Permission checks | none | yes |

**Cross-app shared business logic** (e.g. `src/services/dining/dining-rebate.service.js`) is app-level logic (validation + `ServiceResponse`) that lives under `services/` **only so multiple apps can import it**. It is **not** an owner/queries file and MUST still route all DB access through owner/queries — never touch models directly. (A past leak where such a file hit models directly was sealed and is exactly what the guardrail now prevents.)

### 6.5 Retiring BaseService

`BaseService` is retired (the file still exists under `services/base/` but is legacy). Exactly one stub still `extends BaseService` (`grievance.service.js`, unimplemented). **Do not add new `BaseService` subclasses.** Convert any subclass to a plain class/module that calls owner/queries and returns `ServiceResponse` directly.

### 6.6 The guardrail — `npm run check:boundary`

`scripts/check-model-boundary.mjs` fails the build (exit 1) if any file touches a model outside the allowed places. **Run it after any model-adjacent change.**

- **Allowed to touch a model** (everything else is a violation):
  - `src/models/**`
  - any file whose basename matches `/(Owner|Queries)\.service\.js$/`
  - the explicit allowlist `ALLOW_EXPLICIT` — currently `services/action-links/action-link-token.service.js` and `services/audit/audit.service.js` (legacy single-file owners).
- **Authoritative model set:** the script imports `src/models/index.js` and reads `mongoose.modelNames()`. That's why importing a **constant enum** from a model file is never flagged — only real model names count.
- **Two detectors:** (A) *import-gate* — a non-allowed file importing a model name from a `models/` path; (B) *member-access* — `Model.method(` or `new Model(`, scanned after blanking comments **and** string/template literals (so import paths like `.../Room.model.js` are not misread as `Room.model`).
- **Adding a NEW domain owner:** name it `<domain>Owner.service.js` / `<domain>Queries.service.js` and it "just works." If it genuinely cannot follow that naming, add its repo-relative path (forward slashes) to `ALLOW_EXPLICIT`.

```
$ npm run check:boundary
✅ model-boundary clean — 75 models, 518 files scanned.
```

### 6.7 ServiceResponse & transactions (`src/services/base/`)

- Import response + transaction primitives from the barrel `../base/index.js`. Helpers: `success(data, statusCode=200, message=null)`, `created` (201), `error(msg, 500, details)`, `notFound(entity)` (404), `badRequest` (400), `unauthorized` (401), `forbidden` (403), `conflict` (409), `paginated(items, { page, limit, total })`.
- **⚠️ `success()` message-hoist quirk:** if the **first arg** is a non-array object containing a **string `message` key**, that message is hoisted to `result.message` and the remaining keys become `data`. So `success({ message: 'x', foo })` → `{ message: 'x', data: { foo } }`, but `success({ rebates: [...] })` (no `message` key) keeps the whole object as `data`. Assert on `result.message`, and don't name a payload field `message` unless you mean it.
- **Transactions:** wrap multi-document atomic writes in `await withTransaction(async (session) => { ... })` and thread `session` into every model call (`.session(session)`, `{ session }`). `withTransaction` rethrows on failure; `withTransactionResponse` returns an `error(...)` envelope instead.

## 7. Adding New Work

### 7.1 Add a module to an existing app

1. Create `src/apps/<app>/modules/<module>/` with `<module>.routes.js`, `<module>.controller.js`, `<module>.service.js`, `index.js`.
2. Wire authz in the routes file (prefer `routeGuard`); keep the controller thin; put logic in the service.
3. If the feature needs the DB: read/write **only** through the domain's `…Owner` / `…Queries` (create them under `src/services/<domain>/` if the domain is new — §6).
4. Mount the module in `src/apps/<app>/index.js`.
5. `npm run check:boundary` must stay green.

### 7.2 Add a new major app

1. Create `src/apps/<new-app>/index.js` and module folders.
2. Mount the app in `src/loaders/express.loader.js`.
3. Define the canonical route prefix and ownership (§4).
4. Keep backward compatibility only where active consumers require it.

## 8. Verification Checklist

Before merging:

- **Model boundary:** `npm run check:boundary` prints the clean summary (this is the closest thing to CI — there is **no** test suite; `npm test` is a placeholder).
- **Loader import sanity:** `node -e "import('./src/loaders/express.loader.js')"`.
- **Syntax:** `node --check` on changed files.
- `git status` shows only expected changes.
- Changed frontend flows are manually validated.
- Any compatibility aliases slated for deletion were confirmed unused.

## 9. Pitfalls (read before your first change)

- **The `Owner`/`Queries` filename suffix is load-bearing** — the guardrail grants model access purely by basename regex. A model-touching helper named anything else (even inside `src/services/`) fails the build. This is how a leaked business-logic file was caught.
- **owner/queries must never return a `ServiceResponse`**, and app services must never import a model — that split is the whole point.
- **`success()` message-hoist** (§6.7) silently relocates fields — the single most common envelope-shaping bug.
- **`handler()` is the forward pattern but adopted in only one module** — most controllers hand-roll `asyncHandler` + `res.status().json()`. Match the module you're editing.
- **The wire envelope is not uniform:** `handler()`/`sendStandardResponse` emits `{ success, message, data, errors }`; hand-rolled controllers emit `{ success, message, data }`; `sendRawResponse` returns the bare payload. Don't assume one shape everywhere.
- **hydrated vs lean is deliberate:** queries default to hydrated when the value feeds a mutate-then-save flow (`owner.persistX(doc)`); passing `lean: true` there breaks `.save()`.
- **Public routes go before `router.use(authenticate)`** or the global guard blocks them.

## 10. Design Principles

Timeless rules to keep the codebase simple and consistent:

- **Start simple; split only when it pays.** A feature is `routes` + `controller` + `service` by default (§5). Split a service further (capability files, extra helpers) only when logic is reused across entry points (HTTP + jobs + sockets + scripts), orchestration is non-trivial (transactions / multi-model workflows / heavy side effects), or a file consistently exceeds ~400–500 lines, 8–10 handlers, or 3+ distinct concerns. If a split doesn't reduce complexity, revert it.
- **Split by capability, not by technical layer** when a module grows (`feature.session`, `feature.password`, … — not `feature.moreControllers`).
- **No pass-through wrappers.** Don't export a handler that only forwards to another function. Keep short, single-use logic inline; extract a helper only for genuine reuse or to isolate a side effect (session, crypto, external API).
- **One response/error/validation stack.** Use `ServiceResponse` envelopes (§6.7) + the api-kit sender + the single global error handler (`src/core/errors/errorHandler.js`). No parallel response systems, no extra wrappers doing the same job, no second validation implementation.
- **Response-contract changes are backend + frontend in one change set.** Define the target shape first, apply it consistently, and don't keep mixed response styles inside one module. No backward-compat shims for old payload shapes once a module has been migrated.
- **Data access is owned, always** (§6). If you're reaching for a model outside a `…Owner`/`…Queries` service, stop — add/extend the owner or queries instead.

## 11. Architecture History (condensed)

The backend reached its current shape in two migrations (detailed logs previously in `BACKEND_EVOLUTION.md` / `MODULAR_ARCHITECTURE_PLAN.md`, now removed):

1. **Flat → modular (Jan 2026).** A flat `controllers/ + routes/v1/` layout was reorganized into per-domain app modules under `src/apps/`, with a loader-based server init.
2. **Domain-ownership service layer (2026).** All Mongoose model access (reads + writes) was consolidated into per-domain `…Owner` / `…Queries` services under `src/services/<domain>/`, and made self-enforcing via `npm run check:boundary` (§6).

The transitional backend-root re-export directories, `src/routes/`, `src/external/`, and the old flat controllers have all been removed — there are no deprecated import paths to preserve.

## 12. Authorization (AuthZ)

Auth is **three layers**, applied in this order on a protected route:

1. `authenticate` — session/identity; populates `req.user`.
2. `authorizeRoles([...])` — role gate.
3. `requireRouteAccess("route.<scope>.<feature>")` — dynamic Layer-3 route access.

`routeGuard` (from `lib/api-kit`, §5.1) composes layers 2–3 for you — prefer it for new routes.

**Layer-3 is strict-only:** a denied route / capability / constraint check returns **403**. Do not add observe / preview / fallback paths.

**Source-of-truth files:**
- Catalog: `src/core/authz/authz.catalog.js`
- Middleware: `src/middlewares/authz.middleware.js`
- IAM authz APIs: `src/apps/iam/modules/authz/` (`/api/v1/authz/*`, **Super-Admin only**)
- Per-user overrides: `src/models/user/User.model.js` (`authz.override`, `authz.meta`)

**Rollout is intentionally narrow** — route access is the primary control. Only one capability and one constraint are live in runtime code:
- capability `cap.students.edit.personal` — student personal-edit endpoints (`profiles-admin.routes.js`, via `requireAnyCapability`).
- constraint `constraint.complaints.scope.hostelIds` — enforced in `complaints.service.js`.

Do **not** reintroduce the legacy permission runtime (`/permissions`, `requirePermission`, `user.permissions`).

**Adding route-level authz:** (1) add the route key in `authz.catalog.js`; (2) apply `requireRouteAccess(...)` (or `routeGuard`) in the route file; (3) make sure the Super-Admin authz UI/help lists the new route.

**Key naming (keep consistent):** `route.<scope>.<feature>` · `cap.<feature>.<action>` · `constraint.<feature>.<scope>`.

Reintroduce capabilities/constraints only **feature-by-feature** — add the key in the catalog, enforce on the exact sensitive endpoint (constraints in the **service** layer, not only the route), add UI where needed. Never bulk-add across modules, and no wildcard capability shortcuts.

## 13. Runtime & Stack

- **Stack:** Node.js (ESM) · Express 4 · Mongoose 9 / MongoDB (replica set for transactions) · sessions via `connect-mongo` · realtime via Socket.IO (+ Redis adapter, optional) · file storage Azure Blob **or** local (`USE_LOCAL_STORAGE=true`).
- **Socket.IO events:** `notification`, `visitor-update`, `complaint-update`, `online-users` — see `src/loaders/socket.loader.js`.
- **Machine / API-key access:** the `ApiClient` model; keys managed by Super-Admins at `/api/v1/super-admin/api-clients`, consumed by machine endpoints (e.g. face-scanner). The old `/external-api` router was removed.
- **HTTP routes** are defined by each module's `*.routes.js` and mounted in `src/loaders/express.loader.js` (§3) — there is no separate route-list doc to keep in sync.
- **Env:** full list in `.env.example`; required keys are `MONGO_URI` and `SESSION_SECRET`.

## Related reference docs (not guides)

These are the only backend docs kept outside this file — they are reference artifacts, not rules:

- `docs/accommodation-flow.md` — the accommodation workflow diagram (referenced from `accommodation.workflow.js` and `AccommodationRequest.model.js`).
- `hostel-management-system-er-diagram.md` — data-model ER diagram.
- `srs.md` — original software-requirements spec (historical).
