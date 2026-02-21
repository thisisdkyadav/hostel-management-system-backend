/**
 * Redis cache helpers for API-layer caching.
 * This is intentionally separate from Socket.IO Redis internals.
 */

import { deleteCacheKey, getCacheJson, setCacheJson } from "../services/cache/redisDataCache.client.js";

const DASHBOARD_CACHE_PREFIX = "cache:student:dashboard:v1";
const DEFAULT_DASHBOARD_TTL_SECONDS = Number.parseInt(process.env.STUDENT_DASHBOARD_CACHE_TTL_SECONDS, 10) || 120;

const buildStudentDashboardCacheKey = (userId) => {
  if (!userId) return null;
  return `${DASHBOARD_CACHE_PREFIX}:${userId.toString()}`;
};

export const getStudentDashboardCache = async (userId) => {
  const key = buildStudentDashboardCacheKey(userId);
  if (!key) return null;

  try {
    return getCacheJson(key);
  } catch (error) {
    console.error("Student dashboard cache read failed:", error?.message || error);
    return null;
  }
};

export const setStudentDashboardCache = async (userId, payload, ttlSeconds = DEFAULT_DASHBOARD_TTL_SECONDS) => {
  const key = buildStudentDashboardCacheKey(userId);
  if (!key || !payload) return false;

  try {
    return setCacheJson(key, payload, ttlSeconds);
  } catch (error) {
    console.error("Student dashboard cache write failed:", error?.message || error);
    return false;
  }
};

export const invalidateStudentDashboardCache = async (userId) => {
  const key = buildStudentDashboardCacheKey(userId);
  if (!key) return false;

  try {
    return deleteCacheKey(key);
  } catch (error) {
    console.error("Student dashboard cache invalidation failed:", error?.message || error);
    return false;
  }
};
