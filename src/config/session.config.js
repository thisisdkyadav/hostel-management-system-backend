/**
 * Session Configuration
 * Express session and Redis store settings
 */
import { createRedisSessionStore } from "../services/session/redisSession.store.js"
import { env } from "./env.config.js"

/**
 * Create session configuration
 * Note: Must be called after env is loaded
 */
export const createSessionConfig = () => ({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: createRedisSessionStore({
    prefix: env.REDIS_SESSION_PREFIX,
    ttlSeconds: env.SESSION_TTL_SECONDS,
  }),
  cookie: {
    httpOnly: true,
    secure: !env.isDevelopment,
    sameSite: env.isDevelopment ? "Strict" : "None",
    maxAge: env.SESSION_TTL_SECONDS * 1000,
  },
})

// Create default session config
export const sessionConfig = createSessionConfig()

export default sessionConfig
