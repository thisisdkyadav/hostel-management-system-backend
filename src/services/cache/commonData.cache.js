import { Event, LostAndFound } from "../../models/index.js";
import { getCacheJson, getDataCacheClient, setCacheJson } from "./redisDataCache.client.js";

const EVENTS_CACHE_KEY = "cache:common:events:v2";
const LOST_AND_FOUND_CACHE_KEY = "cache:common:lost-and-found:v2";

const DEFAULT_EVENTS_REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_LOST_AND_FOUND_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EVENTS_CACHE_TTL_SECONDS = 2 * 60 * 60;
const DEFAULT_LOST_AND_FOUND_CACHE_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_FIRST_PAGE_LIMIT = 10;

const EVENTS_REFRESH_INTERVAL_MS =
  Number.parseInt(process.env.COMMON_EVENTS_REFRESH_INTERVAL_MS, 10) ||
  DEFAULT_EVENTS_REFRESH_INTERVAL_MS;
const LOST_AND_FOUND_REFRESH_INTERVAL_MS =
  Number.parseInt(process.env.COMMON_LOST_AND_FOUND_REFRESH_INTERVAL_MS, 10) ||
  DEFAULT_LOST_AND_FOUND_REFRESH_INTERVAL_MS;
const EVENTS_CACHE_TTL_SECONDS =
  Number.parseInt(process.env.COMMON_EVENTS_CACHE_TTL_SECONDS, 10) ||
  DEFAULT_EVENTS_CACHE_TTL_SECONDS;
const LOST_AND_FOUND_CACHE_TTL_SECONDS =
  Number.parseInt(process.env.COMMON_LOST_AND_FOUND_CACHE_TTL_SECONDS, 10) ||
  DEFAULT_LOST_AND_FOUND_CACHE_TTL_SECONDS;
const FIRST_PAGE_LIMIT =
  Number.parseInt(process.env.COMMON_CACHE_FIRST_PAGE_LIMIT, 10) || DEFAULT_FIRST_PAGE_LIMIT;

const timerRegistry = new Map();

const parseTime = (value) => {
  const timeValue = new Date(value).getTime();
  return Number.isFinite(timeValue) ? timeValue : 0;
};

const toSerializable = (doc) => {
  if (!doc) return null;
  if (typeof doc.toObject === "function") {
    return doc.toObject({ virtuals: true });
  }
  return doc;
};

const sortAllEvents = (events) => {
  const now = Date.now();
  const upcoming = [];
  const past = [];

  for (const event of events) {
    if (parseTime(event?.dateAndTime) > now) {
      upcoming.push(event);
    } else {
      past.push(event);
    }
  }

  upcoming.sort((left, right) => parseTime(left?.dateAndTime) - parseTime(right?.dateAndTime));
  past.sort((left, right) => parseTime(right?.dateAndTime) - parseTime(left?.dateAndTime));
  return [...upcoming, ...past];
};

const sortUpcomingEvents = (events) => {
  const now = Date.now();
  return events
    .filter((event) => parseTime(event?.dateAndTime) > now)
    .sort((left, right) => parseTime(left?.dateAndTime) - parseTime(right?.dateAndTime));
};

const buildEventStats = (allSorted, upcomingSorted) => {
  const total = allSorted.length;
  const upcoming = upcomingSorted.length;
  const past = Math.max(total - upcoming, 0);
  return {
    total,
    upcoming,
    past,
    nextEventDate: upcoming > 0 ? upcomingSorted[0]?.dateAndTime || null : null,
  };
};

const buildEventsCachePayload = async () => {
  const docs = await Event.find({}).sort({ dateAndTime: 1 });
  const rawEvents = docs.map(toSerializable).filter(Boolean);
  const allSorted = sortAllEvents(rawEvents);
  const upcomingSorted = sortUpcomingEvents(rawEvents);
  const stats = buildEventStats(allSorted, upcomingSorted);

  return {
    updatedAt: new Date().toISOString(),
    all: allSorted,
    upcoming: upcomingSorted,
    firstPage: {
      all: allSorted.slice(0, FIRST_PAGE_LIMIT),
      upcoming: upcomingSorted.slice(0, FIRST_PAGE_LIMIT),
    },
    stats,
  };
};

const buildLostAndFoundStats = (items) => {
  const total = items.length;
  let active = 0;
  let claimed = 0;

  for (const item of items) {
    if (item?.status === "Active") active += 1;
    if (item?.status === "Claimed") claimed += 1;
  }

  return {
    total,
    active,
    claimed,
    latestItemDate: total > 0 ? items[0]?.dateFound || null : null,
  };
};

const buildLostAndFoundCachePayload = async () => {
  const docs = await LostAndFound.find({}).sort({ dateFound: -1 });
  const allSorted = docs.map(toSerializable).filter(Boolean);
  const stats = buildLostAndFoundStats(allSorted);

  return {
    updatedAt: new Date().toISOString(),
    all: allSorted,
    firstPage: {
      all: allSorted.slice(0, FIRST_PAGE_LIMIT),
    },
    stats,
  };
};

const releaseLockScript =
  'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end';

const withRefreshLock = async (lockKey, lockTtlSeconds, task) => {
  let redis;
  try {
    redis = getDataCacheClient();
  } catch (error) {
    console.error(`Failed to get Redis client for lock "${lockKey}":`, error?.message || error);
    return false;
  }

  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  let acquired = null;
  try {
    acquired = await redis.set(lockKey, token, "NX", "EX", lockTtlSeconds);
  } catch (error) {
    console.error(`Failed to acquire cache lock "${lockKey}":`, error?.message || error);
    return false;
  }

  if (!acquired) return false;

  try {
    await task();
    return true;
  } finally {
    try {
      await redis.eval(releaseLockScript, 1, lockKey, token);
    } catch (error) {
      console.error(`Failed to release cache lock "${lockKey}":`, error?.message || error);
    }
  }
};

const cacheRegistry = {
  events: {
    key: EVENTS_CACHE_KEY,
    ttlSeconds: EVENTS_CACHE_TTL_SECONDS,
    intervalMs: EVENTS_REFRESH_INTERVAL_MS,
    lockKey: "cache:lock:refresh:events",
    lockTtlSeconds: 120,
    buildPayload: buildEventsCachePayload,
  },
  lostAndFound: {
    key: LOST_AND_FOUND_CACHE_KEY,
    ttlSeconds: LOST_AND_FOUND_CACHE_TTL_SECONDS,
    intervalMs: LOST_AND_FOUND_REFRESH_INTERVAL_MS,
    lockKey: "cache:lock:refresh:lost-and-found",
    lockTtlSeconds: 120,
    buildPayload: buildLostAndFoundCachePayload,
  },
};

const getCacheResource = (name) => cacheRegistry[name] || null;

const getResourcePayload = async (name) => {
  const resource = getCacheResource(name);
  if (!resource) return null;

  try {
    const payload = await getCacheJson(resource.key);
    if (payload) return payload;

    const refreshed = await refreshCommonCache(name, { useLock: true });
    if (refreshed) {
      const refreshedPayload = await getCacheJson(resource.key);
      if (refreshedPayload) return refreshedPayload;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
    const retryPayload = await getCacheJson(resource.key);
    if (retryPayload) return retryPayload;

    const directRefresh = await refreshCommonCache(name, { useLock: false });
    if (directRefresh) {
      const directPayload = await getCacheJson(resource.key);
      if (directPayload) return directPayload;
    }
  } catch (error) {
    console.error(`Cache payload resolution failed for "${name}":`, error?.message || error);
  }

  // Final fallback: serve from DB build path even if Redis is down.
  try {
    return resource.buildPayload();
  } catch (error) {
    console.error(`DB fallback payload build failed for "${name}":`, error?.message || error);
    return null;
  }
};

export const refreshCommonCache = async (name, { useLock = true } = {}) => {
  const resource = getCacheResource(name);
  if (!resource) return false;

  try {
    const refreshTask = async () => {
      const payload = await resource.buildPayload();
      await setCacheJson(resource.key, payload, resource.ttlSeconds);
    };

    if (!useLock) {
      await refreshTask();
      return true;
    }

    return withRefreshLock(resource.lockKey, resource.lockTtlSeconds, refreshTask);
  } catch (error) {
    console.error(`Cache refresh failed for "${name}":`, error?.message || error);
    return false;
  }
};

export const warmCommonCaches = async () => {
  await Promise.all(Object.keys(cacheRegistry).map((name) => refreshCommonCache(name)));
};

export const startCommonCacheScheduler = () => {
  for (const [name, resource] of Object.entries(cacheRegistry)) {
    if (timerRegistry.has(name)) continue;

    const intervalId = setInterval(() => {
      refreshCommonCache(name).catch((error) => {
        console.error(`Auto-refresh failed for cache "${name}":`, error?.message || error);
      });
    }, resource.intervalMs);

    timerRegistry.set(name, intervalId);
  }
};

export const stopCommonCacheScheduler = () => {
  for (const timerId of timerRegistry.values()) {
    clearInterval(timerId);
  }
  timerRegistry.clear();
};

export const COMMON_CACHE_CONFIG = {
  firstPageLimit: FIRST_PAGE_LIMIT,
  eventsRefreshIntervalMs: EVENTS_REFRESH_INTERVAL_MS,
  lostAndFoundRefreshIntervalMs: LOST_AND_FOUND_REFRESH_INTERVAL_MS,
};

export const getEventsCachePayload = async () => {
  const payload = await getResourcePayload("events");
  if (!payload) {
    return { all: [], upcoming: [], firstPage: { all: [], upcoming: [] }, stats: { total: 0, upcoming: 0, past: 0, nextEventDate: null } };
  }
  return payload;
};

export const getLostAndFoundCachePayload = async () => {
  const payload = await getResourcePayload("lostAndFound");
  if (!payload) {
    return { all: [], firstPage: { all: [] }, stats: { total: 0, active: 0, claimed: 0, latestItemDate: null } };
  }
  return payload;
};

export const getCachedEvents = async () => {
  const payload = await getEventsCachePayload();
  return Array.isArray(payload?.all) ? payload.all : [];
};

export const getCachedLostAndFoundItems = async () => {
  const payload = await getLostAndFoundCachePayload();
  return Array.isArray(payload?.all) ? payload.all : [];
};

// Compatibility exports used by existing services.
export const refreshEventsCache = async () => refreshCommonCache("events");
export const refreshLostAndFoundCache = async () => refreshCommonCache("lostAndFound");
export const syncEventCacheById = async () => refreshCommonCache("events");
export const removeEventFromCache = async () => refreshCommonCache("events");
export const syncLostAndFoundCacheById = async () => refreshCommonCache("lostAndFound");
export const removeLostAndFoundFromCache = async () => refreshCommonCache("lostAndFound");
