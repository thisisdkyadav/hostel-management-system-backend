# Backend Structure Design

This document defines backend structure rules. Start simple by default.

## Rule 1: Controller + Service Split Decision

Default:
1. Keep one module file per feature (`<feature>.module.js`) that includes handlers and core logic.
2. Do not split into separate controller/service files unless there is clear value.

Split into separate `controller` and `service` only when at least one is true:
1. Business logic is reused by multiple entry points (HTTP + jobs + sockets + scripts).
2. Service orchestration is non-trivial (transactions, multi-model workflows, complex side effects).
3. You need focused unit tests for domain logic without HTTP concerns.
4. The module is growing quickly and file size/ownership is becoming hard to manage.

Keep as a single module when:
1. Handlers mostly map request input to DB calls and response shaping.
2. Logic is local to one route group.
3. Splitting would create pass-through methods with little independent value.

Refactor policy:
1. Start single-module.
2. Split later only when complexity appears.
3. If split does not reduce complexity, revert to single-module.

## Rule 2: Common Response/Error/Validation Stack

Use one common stack everywhere:
1. Controllers use `asyncHandler` from `src/utils/index.js`.
2. Services return `ServiceResponse`-style objects (`success`, `badRequest`, `notFound`, etc.).
3. Controllers sending service results use the strict envelope sender from `src/utils/index.js` (`sendStandardResponse`).
4. Global errors are handled only by `src/core/errors/errorHandler.js`.
5. Validation middleware source is `src/middlewares/validate.middleware.js`.
6. Response shape must be:
   `success: boolean`, `message: string | null`, `data: any`, `errors: array | null`.

Avoid:
1. Parallel response systems or extra wrappers for the same job.
2. Multiple validation middleware implementations.
3. Direct imports from deprecated/common-internal paths when `src/utils/index.js` already exports the utility.

## Rule 3: Common Import Consistency

1. For shared utility helpers, prefer importing from `src/utils/index.js`.
2. Only import deep utility files directly when a helper is intentionally not part of the shared API.
3. Keep one clear shared entrypoint for common helpers to reduce drift across modules.

## Rule 4: Large Module Split Strategy

When a module grows, split by capability first, not by technical layer.

Preferred order:
1. Start with one module (`<feature>.module.js`).
2. If size/complexity increases, split into capability files (for example: `feature.session.module.js`, `feature.password.module.js`, `feature.profile.module.js`).
3. Keep shared local internals in `feature.shared.js` only for helpers reused by 2+ capability files.
4. Move to controller/service split only if Rule 1 conditions are met.

Practical triggers to split:
1. File length is consistently above ~400-500 lines.
2. File contains 3+ distinct concerns.
3. File contains 8-10+ route handlers.
4. Review/readability cost is increasing for normal changes.

## Rule 5: Handler Structure (No Pass-Through Wrappers)

1. Avoid exported handlers that only call another function without adding value.
2. Keep logic directly in exported handler when the flow is short and single-use.
3. Extract helper/result functions only when they are reused, isolate complex logic, or isolate side effects (session, external API, crypto, etc.).
4. Prefer clear, local function names over deep call chains.

## Rule 6: Response Contract Migration Policy

Goal:
1. Move all routes to common response sending and common error handling.
2. Eliminate ad-hoc response formats over time.

Migration strategy:
1. For response-standardization tasks, update backend + frontend in the same change set.
2. Define route-level target shape before migration and apply consistently.
3. Do not keep partial mixed response styles inside one module after migration starts.
4. No backward-compatibility shims for legacy payload shapes once a module is migrated.
