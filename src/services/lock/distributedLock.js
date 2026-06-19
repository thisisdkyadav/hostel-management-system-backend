/**
 * Redis-backed distributed lock for cluster-safe work (PM2 multi-core).
 *
 * Generalizes the cache-refresh lock pattern so any scheduled/one-off job can run
 * on exactly one instance. Uses the shared data-cache Redis client.
 *
 * - `release: true`  (default) — mutual exclusion *during* the task; lock freed on finish.
 * - `release: false` — once-per-window execution; the key is left to expire after
 *   `lockTtlSeconds`, so no other instance repeats the work within that window.
 */

import { getDataCacheClient } from "../cache/redisDataCache.client.js"

const releaseLockScript =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end'

// Returned when the lock could not be acquired (another instance holds it).
export const LOCK_NOT_ACQUIRED = Symbol("lock-not-acquired")

export const withLock = async (lockKey, lockTtlSeconds, task, { release = true } = {}) => {
  let redis
  try {
    redis = getDataCacheClient()
  } catch (error) {
    console.error(`Lock: Redis unavailable for "${lockKey}":`, error?.message || error)
    return LOCK_NOT_ACQUIRED
  }

  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`

  let acquired = null
  try {
    acquired = await redis.set(lockKey, token, "NX", "EX", lockTtlSeconds)
  } catch (error) {
    console.error(`Lock: failed to acquire "${lockKey}":`, error?.message || error)
    return LOCK_NOT_ACQUIRED
  }

  if (!acquired) return LOCK_NOT_ACQUIRED

  try {
    return await task()
  } finally {
    if (release) {
      try {
        await redis.eval(releaseLockScript, 1, lockKey, token)
      } catch (error) {
        console.error(`Lock: failed to release "${lockKey}":`, error?.message || error)
      }
    }
  }
}

export default withLock
