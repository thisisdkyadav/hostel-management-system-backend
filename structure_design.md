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
