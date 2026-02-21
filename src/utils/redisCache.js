/**
 * Redis cache helpers for API-layer caching.
 * This is intentionally separate from Socket.IO Redis internals.
 */

import Redis from "ioredis";
import env from "../config/env.config.js";

const DASHBOARD_CACHE_PREFIX = "cache:student:dashboard:v1";
const DEFAULT_DASHBOARD_TTL_SECONDS = Number.parseInt(process.env.STUDENT_DASHBOARD_CACHE_TTL_SECONDS, 10) || 120;

let cacheClient = null;

const getCacheClient = () => {
  if (cacheClient) return cacheClient;

  cacheClient = new Redis(env.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 1,
  });

  cacheClient.on("error", (error) => {
    console.error("Redis cache client error:", error?.message || error);
  });

  return cacheClient;
};

const buildStudentDashboardCacheKey = (userId) => {
  if (!userId) return null;
  return `${DASHBOARD_CACHE_PREFIX}:${userId.toString()}`;
};

export const getStudentDashboardCache = async (userId) => {
  const key = buildStudentDashboardCacheKey(userId);
  if (!key) return null;

  try {
    const client = getCacheClient();
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error("Student dashboard cache read failed:", error?.message || error);
    return null;
  }
};

export const setStudentDashboardCache = async (userId, payload, ttlSeconds = DEFAULT_DASHBOARD_TTL_SECONDS) => {
  const key = buildStudentDashboardCacheKey(userId);
  if (!key || !payload) return false;

  try {
    const client = getCacheClient();
    await client.set(key, JSON.stringify(payload), "EX", ttlSeconds);
    return true;
  } catch (error) {
    console.error("Student dashboard cache write failed:", error?.message || error);
    return false;
  }
};

export const invalidateStudentDashboardCache = async (userId) => {
  const key = buildStudentDashboardCacheKey(userId);
  if (!key) return false;

  try {
    const client = getCacheClient();
    await client.del(key);
    return true;
  } catch (error) {
    console.error("Student dashboard cache invalidation failed:", error?.message || error);
    return false;
  }
};

