import session from "express-session";
import env from "../../config/env.config.js";
import { getSessionRedisClient } from "./redisSessionClient.js";

const getTtlSeconds = (sessionData, fallbackTtlSeconds) => {
  const cookieMaxAgeMs = sessionData?.cookie?.maxAge;
  if (typeof cookieMaxAgeMs === "number" && cookieMaxAgeMs > 0) {
    return Math.ceil(cookieMaxAgeMs / 1000);
  }
  return fallbackTtlSeconds;
};

class RedisSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.client = options.client || getSessionRedisClient();
    this.prefix = options.prefix || env.REDIS_SESSION_PREFIX;
    this.ttlSeconds = options.ttlSeconds || env.SESSION_TTL_SECONDS;
  }

  key(sessionId) {
    return `${this.prefix}${sessionId}`;
  }

  get(sessionId, callback) {
    this.client
      .get(this.key(sessionId))
      .then((rawData) => {
        if (!rawData) {
          callback?.();
          return;
        }
        try {
          const parsed = JSON.parse(rawData);
          callback?.(null, parsed);
        } catch (error) {
          callback?.(error);
        }
      })
      .catch((error) => callback?.(error));
  }

  set(sessionId, sessionData, callback) {
    const ttlSeconds = getTtlSeconds(sessionData, this.ttlSeconds);

    let payload;
    try {
      payload = JSON.stringify(sessionData);
    } catch (error) {
      callback?.(error);
      return;
    }

    this.client
      .set(this.key(sessionId), payload, "EX", ttlSeconds)
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  destroy(sessionId, callback) {
    this.client
      .del(this.key(sessionId))
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }

  touch(sessionId, sessionData, callback) {
    const ttlSeconds = getTtlSeconds(sessionData, this.ttlSeconds);

    this.client
      .expire(this.key(sessionId), ttlSeconds)
      .then(() => callback?.())
      .catch((error) => callback?.(error));
  }
}

export const createRedisSessionStore = (options = {}) => new RedisSessionStore(options);
export { RedisSessionStore };

