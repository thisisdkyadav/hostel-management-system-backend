# HMS Backend Integration Tests

API-level integration tests for the Express backend. Tests hit the real app
(`src/app.js` through supertest) against a **real local MongoDB replica set**
and **real Redis** — no mocks of app internals.

## Layout

```
tests/
├── package.json / vitest.config.js   # isolated tooling; env isolation lives here
├── smoke.test.js                     # harness sanity check
├── helpers/
│   ├── db.js        # setupTestDb() / teardownTestDb()
│   ├── http.js      # as(user), anon() -> { get, post, put, patch, delete }
│   ├── session.js   # fabricates a real Redis-backed session + signed cookie
│   └── seed.js      # seed.createUser / .student / .warden / .admin / ...
└── apps/<area>/<module>.test.js      # one file per backend module
```

## Running

```bash
cd backend/tests
npm install
npm test                 # whole suite (files run sequentially by design)
npx vitest run apps/complaints   # one area
npx vitest run apps/iam/users.test.js
```

Requires: `mongod` running with replica set `rs0` on 27017, `redis-server` on 6379.
The suite uses database `hms_integration_tests` and Redis prefix `itest:sess:` —
never touches dev data.

## Conventions for new test files

1. One file per backend module, mirroring the source tree:
   `apps/<area>/<module>.test.js`.
2. Every file starts from zero:

   ```js
   import { setupTestDb } from "../../helpers/db.js"
   beforeAll(async () => { await setupTestDb() })
   ```

   Files run sequentially (`fileParallelism: false`) so dropping is safe.
3. Seed everything through `helpers/seed.js` (extend it with domain fixtures —
   e.g. hostels, rooms, complaints — using the backend's own models).
4. Authenticate via `as(user)`; never hand-craft cookies:

   ```js
   const api = await as(student)
   const res = await api.post("/api/v1/complaint").send({ ... })
   expect(res.status).toBe(201)
   ```

5. Cover, per route: unauthenticated 401 → wrong-role 403 → validation 400 →
   happy path (assert status + envelope shape + returned data) → not-found /
   conflict / permission-scope edge cases → state transitions in order.
6. Assert the standard envelope `{ success, message?, data }`; where a response
   only returns ids, verify persistence through a follow-up GET (stay at the
   API level — do not query models inside assertions when an API can do it).
7. Do not modify anything outside `backend/tests/`. If a bug in the backend
   surfaces, write the test to document current behavior and flag it in the PR
   description instead of changing app code.
