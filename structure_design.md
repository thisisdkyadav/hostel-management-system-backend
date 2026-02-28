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
3. Controllers sending service results use `sendRawResponse` from `src/utils/index.js` when needed.
4. Global errors are handled only by `src/core/errors/errorHandler.js`.
5. Validation middleware source is `src/middlewares/validate.middleware.js`.

Avoid:
1. Parallel response systems or extra wrappers for the same job.
2. Multiple validation middleware implementations.
3. Direct imports from deprecated/common-internal paths when `src/utils/index.js` already exports the utility.

## Rule 3: Common Import Consistency

1. For shared utility helpers, prefer importing from `src/utils/index.js`.
2. Only import deep utility files directly when a helper is intentionally not part of the shared API.
3. Keep one clear shared entrypoint for common helpers to reduce drift across modules.
