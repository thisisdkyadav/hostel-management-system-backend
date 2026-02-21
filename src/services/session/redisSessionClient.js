import Redis from "ioredis";
import env from "../../config/env.config.js";

let sessionRedisClient = null;

export const getSessionRedisClient = () => {
  if (sessionRedisClient) return sessionRedisClient;

  sessionRedisClient = new Redis(env.REDIS_URL, {
    retryStrategy: (times) => Math.min(times * 50, 2000),
  });

  sessionRedisClient.on("error", (error) => {
    console.error("Session Redis client error:", error?.message || error);
  });

  return sessionRedisClient;
};

export const closeSessionRedisClient = async () => {
  if (!sessionRedisClient) return;

  try {
    await sessionRedisClient.quit();
    console.log("✓ Session Redis client disconnected");
  } catch (error) {
    console.error("Error closing session Redis client:", error?.message || error);
  } finally {
    sessionRedisClient = null;
  }
};

export default getSessionRedisClient;
