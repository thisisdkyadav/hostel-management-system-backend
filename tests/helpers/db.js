/**
 * Database lifecycle for integration tests.
 *
 * The suite uses ONE dedicated Mongo database (see vitest.config.js).
 * Each test file calls `setupTestDb()` in beforeAll — it connects mongoose
 * (once per process) and drops the database so every file starts from zero.
 */
import mongoose from "mongoose"

let connecting = null

export async function setupTestDb() {
  if (mongoose.connection.readyState === 0) {
    const { env } = await import("../../src/config/env.config.js")
    connecting = mongoose.connect(env.MONGO_URI, { dbName: undefined })
    await connecting
  }
  // Clean slate: drop everything (collections AND indexes).
  const collections = await mongoose.connection.db.collections()
  for (const c of collections) {
    await c.drop().catch((e) => {
      if (e.codeName !== "NamespaceNotFound") throw e
    })
  }
  return mongoose.connection
}

export async function teardownTestDb() {
  // Keep the connection open across files in the same worker; vitest closes
  // the process after the run. Flush test sessions from Redis instead.
  await flushTestSessions()
}

export async function flushTestSessions() {
  const { default: Redis } = await import("ioredis")
  const { env } = await import("../../src/config/env.config.js")
  const redis = new Redis(env.REDIS_URL)
  const keys = await redis.keys(`${env.REDIS_SESSION_PREFIX}*`)
  if (keys.length > 0) await redis.del(...keys)
  redis.disconnect()
}
