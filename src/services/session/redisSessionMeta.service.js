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

