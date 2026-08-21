import { defineConfig } from "vitest/config"

// Integration-test configuration.
//
// These env vars are set BEFORE the backend's env.config.js runs its dotenv
// load, and dotenv never overrides existing process.env entries — so these
// values always win over backend/.env. That is what isolates the suite:
//   - dedicated Mongo database (dropped between test files)
//   - dedicated Redis key prefix for fabricated sessions
// Namespace knobs so parallel runs (e.g. per-area during development) never
// share state. The plain `npm test` run uses the defaults.
const NS = process.env.ITEST_NS ? `${process.env.ITEST_NS}-` : ""

const TEST_ENV = {
  NODE_ENV: "development",
  MONGO_URI: `mongodb://127.0.0.1:27017/hms_integration_tests_${NS}main?replicaSet=rs0`,
  REDIS_URL: "redis://127.0.0.1:6379",
  REDIS_SESSION_PREFIX: `itest${NS ? "-" + NS : ""}:sess:`,
  SESSION_SECRET: "integration-test-session-secret-do-not-use-in-prod",
  USE_LOCAL_STORAGE: "true",
}

export default defineConfig({
  test: {
    include: ["**/*.test.js"],
    environment: "node",
    globals: false,
    // All files share one Mongo database, so files must not run concurrently
    // (each file drops the database in its beforeAll for a clean slate).
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: TEST_ENV,
  },
})
