import Redis from "ioredis";
import env from "../../config/env.config.js";

let dataCacheClient = null;

export const getDataCacheClient = () => {
  if (dataCacheClient) return dataCacheClient;

  dataCacheClient = new Redis(env.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
    maxRetriesPerRequest: 1,
  });

  dataCacheClient.on("error", (error) => {
    console.error("Data cache Redis client error:", error?.message || error);
  });

  return dataCacheClient;
};

export const closeDataCacheClient = async () => {
  if (!dataCacheClient) return;

  try {
    await dataCacheClient.quit();
    console.log("✓ Data cache Redis client disconnected");
  } catch (error) {
    console.error("Error closing data cache Redis client:", error?.message || error);
  } finally {
    dataCacheClient = null;
  }
};

export const getCacheJson = async (key) => {
  if (!key) return null;

  try {
    const client = getDataCacheClient();
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Cache read failed for key "${key}":`, error?.message || error);
    return null;
  }
};

export const setCacheJson = async (key, payload, ttlSeconds) => {
  if (!key || payload === undefined) return false;

  try {
    const client = getDataCacheClient();
    if (ttlSeconds && Number.isFinite(Number(ttlSeconds)) && Number(ttlSeconds) > 0) {
      await client.set(key, JSON.stringify(payload), "EX", Number(ttlSeconds));
    } else {
      await client.set(key, JSON.stringify(payload));
    }
    return true;
  } catch (error) {
    console.error(`Cache write failed for key "${key}":`, error?.message || error);
    return false;
  }
};

export const deleteCacheKey = async (key) => {
  if (!key) return false;

  try {
    const client = getDataCacheClient();
    await client.del(key);
    return true;
  } catch (error) {
    console.error(`Cache delete failed for key "${key}":`, error?.message || error);
    return false;
  }
};

