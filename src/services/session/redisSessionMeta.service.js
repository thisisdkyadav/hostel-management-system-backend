import env from "../../config/env.config.js";
import { getSessionRedisClient } from "./redisSessionClient.js";

const SESSION_META_PREFIX = "session:meta:v1";
const USER_SESSIONS_PREFIX = "session:user:v1";

const toIsoString = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
};

const toEpochMs = (value) => {
  const date = new Date(value);
  const timestamp = date.getTime();
  return Number.isNaN(timestamp) ? Date.now() : timestamp;
};

const getSessionMetaKey = (sessionId) => `${SESSION_META_PREFIX}:${sessionId}`;
const getUserSessionsKey = (userId) => `${USER_SESSIONS_PREFIX}:${userId}`;

const deserializeSessionMeta = (raw) => {
  if (!raw || Object.keys(raw).length === 0) return null;

  return {
    userId: raw.userId || null,
    sessionId: raw.sessionId || null,
    userAgent: raw.userAgent || "",
    ip: raw.ip || "",
    deviceName: raw.deviceName || "Unknown device",
    loginTime: raw.loginTime || null,
    lastActive: raw.lastActive || null,
  };
};

export const createSessionMeta = async ({
  userId,
  sessionId,
  userAgent = "",
  ip = "",
  deviceName = "Unknown device",
  loginTime = new Date(),
  lastActive = new Date(),
}) => {
  const userIdString = userId?.toString?.() || "";
  const sessionIdString = sessionId?.toString?.() || "";

  if (!userIdString || !sessionIdString) return false;

  const loginTimeIso = toIsoString(loginTime);
  const lastActiveIso = toIsoString(lastActive);

  const client = getSessionRedisClient();
  const metaKey = getSessionMetaKey(sessionIdString);
  const userSessionsKey = getUserSessionsKey(userIdString);
  const ttlSeconds = env.SESSION_TTL_SECONDS;

  await client
    .multi()
    .hset(metaKey, {
      userId: userIdString,
      sessionId: sessionIdString,
      userAgent,
      ip,
      deviceName,
      loginTime: loginTimeIso,
      lastActive: lastActiveIso,
    })
    .expire(metaKey, ttlSeconds)
    .zadd(userSessionsKey, toEpochMs(lastActiveIso), sessionIdString)
    .expire(userSessionsKey, ttlSeconds)
    .exec();

  return true;
};

export const getSessionMeta = async (sessionId) => {
  const sessionIdString = sessionId?.toString?.() || "";
  if (!sessionIdString) return null;

  const client = getSessionRedisClient();
  const raw = await client.hgetall(getSessionMetaKey(sessionIdString));
  return deserializeSessionMeta(raw);
};

export const listUserSessionIds = async (userId) => {
  const userIdString = userId?.toString?.() || "";
  if (!userIdString) return [];

  const client = getSessionRedisClient();
  return client.zrevrange(getUserSessionsKey(userIdString), 0, -1);
};

export const listUserSessions = async (userId) => {
  const userIdString = userId?.toString?.() || "";
  if (!userIdString) return [];

  const client = getSessionRedisClient();
  const userSessionsKey = getUserSessionsKey(userIdString);
  const sessionIds = await client.zrevrange(userSessionsKey, 0, -1);

  if (sessionIds.length === 0) return [];

  const pipeline = client.multi();
  sessionIds.forEach((sessionId) => pipeline.hgetall(getSessionMetaKey(sessionId)));
  const rows = await pipeline.exec();

  const staleSessionIds = [];
  const sessions = [];

  rows.forEach(([error, raw], index) => {
    const sessionId = sessionIds[index];
    if (error) {
      staleSessionIds.push(sessionId);
      return;
    }

    const sessionMeta = deserializeSessionMeta(raw);
    if (!sessionMeta) {
      staleSessionIds.push(sessionId);
      return;
    }

    sessions.push(sessionMeta);
  });

  if (staleSessionIds.length > 0) {
    await client.zrem(userSessionsKey, ...staleSessionIds);
  }

  return sessions.sort((a, b) => toEpochMs(b.lastActive) - toEpochMs(a.lastActive));
};

export const touchSessionMeta = async (sessionId, lastActive = new Date()) => {
  const sessionIdString = sessionId?.toString?.() || "";
  if (!sessionIdString) return false;

  const sessionMeta = await getSessionMeta(sessionIdString);
  if (!sessionMeta?.userId) return false;

  const lastActiveIso = toIsoString(lastActive);
  const client = getSessionRedisClient();
  const metaKey = getSessionMetaKey(sessionIdString);
  const userSessionsKey = getUserSessionsKey(sessionMeta.userId);
  const ttlSeconds = env.SESSION_TTL_SECONDS;

  await client
    .multi()
    .hset(metaKey, "lastActive", lastActiveIso)
    .expire(metaKey, ttlSeconds)
    .zadd(userSessionsKey, toEpochMs(lastActiveIso), sessionIdString)
    .expire(userSessionsKey, ttlSeconds)
    .exec();

  return true;
};

/**
 * Revoke every session belonging to a user: removes the live session payload
 * (`sess:<id>`, shared with the Go auth backend), its meta hash, and the
 * user's session-index entry. Best-effort by design — callers must not fail
 * the primary operation when revocation errors.
 */
export const revokeUserSessions = async (userId) => {
  const userIdString = userId?.toString?.() || "";
  if (!userIdString) return 0;

  const client = getSessionRedisClient();
  const sessionIds = await client.zrevrange(getUserSessionsKey(userIdString), 0, -1);
  if (sessionIds.length === 0) return 0;

  const pipeline = client.multi();
  sessionIds.forEach((sessionId) => {
    pipeline.del(`${env.REDIS_SESSION_PREFIX}${sessionId}`);
    pipeline.del(getSessionMetaKey(sessionId));
  });
  pipeline.del(getUserSessionsKey(userIdString));
  await pipeline.exec();

  return sessionIds.length;
};

const USER_SESSIONS_KEY_PREFIX = `${USER_SESSIONS_PREFIX}:`;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const emptyActivity = () => ({
  daily: 0,
  weekly: 0,
  signedIn: 0,
  dailyUserIds: [],
  weeklyUserIds: [],
});

const userIdFromSessionsKey = (key) => {
  const index = String(key).indexOf(USER_SESSIONS_KEY_PREFIX);
  if (index < 0) return "";
  return String(key).slice(index + USER_SESSIONS_KEY_PREFIX.length);
};

const scanSessionUserKeys = async (client) => {
  const keys = [];
  const stream = client.scanStream({ match: `${USER_SESSIONS_KEY_PREFIX}*`, count: 200 });

  await new Promise((resolve, reject) => {
    stream.on("data", (batch) => {
      if (Array.isArray(batch) && batch.length > 0) keys.push(...batch);
    });
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  return keys;
};

/**
 * Unique users with a live session, bucketed by session lastActive.
 * lastActive is written by Go on login and on /authz/me (every app open).
 * Sessions expire after SESSION_TTL_SECONDS (7 days), so weekly ≈ signed-in.
 */
export const countSessionActivity = async (now = new Date()) => {
  try {
    const client = getSessionRedisClient();
    const keys = await scanSessionUserKeys(client);
    if (keys.length === 0) return emptyActivity();

    const pipeline = client.pipeline();
    keys.forEach((key) => pipeline.zrevrange(key, 0, 0, "WITHSCORES"));
    const rows = await pipeline.exec();

    const nowMs = now instanceof Date ? now.getTime() : Date.now();
    const dayAgo = nowMs - DAY_MS;
    const weekAgo = nowMs - WEEK_MS;
    const dailyUserIds = [];
    const weeklyUserIds = [];
    const signedInIds = [];

    keys.forEach((key, index) => {
      const userId = userIdFromSessionsKey(key);
      const tuple = rows?.[index];
      const result = Array.isArray(tuple) ? tuple[1] : null;
      if (!userId || !Array.isArray(result) || result.length < 2) return;

      const lastActive = Number(result[1]);
      if (!Number.isFinite(lastActive)) return;

      signedInIds.push(userId);
      if (lastActive >= weekAgo) weeklyUserIds.push(userId);
      if (lastActive >= dayAgo) dailyUserIds.push(userId);
    });

    return {
      daily: dailyUserIds.length,
      weekly: weeklyUserIds.length,
      signedIn: signedInIds.length,
      dailyUserIds,
      weeklyUserIds,
    };
  } catch (error) {
    console.error("Error counting session activity:", error?.message || error);
    return emptyActivity();
  }
};

export const deleteSessionMeta = async (sessionId, userId = null) => {
  const sessionIdString = sessionId?.toString?.() || "";
  if (!sessionIdString) return false;

  const client = getSessionRedisClient();
  let userIdString = userId?.toString?.() || "";

  if (!userIdString) {
    userIdString = (await client.hget(getSessionMetaKey(sessionIdString), "userId")) || "";
  }

  const pipeline = client.multi().del(getSessionMetaKey(sessionIdString));
  if (userIdString) {
    pipeline.zrem(getUserSessionsKey(userIdString), sessionIdString);
  }
  await pipeline.exec();

  return true;
};

