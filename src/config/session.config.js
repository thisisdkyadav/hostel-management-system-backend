/**
 * Session Configuration
 * Express session and Redis store settings
 */
import { createRedisSessionStore } from "../services/session/redisSession.store.js"
import { env } from "./env.config.js"

/**
 * Cookie SameSite must match go-backend defaultSameSite:
 * - HTTPS / production: None (cross-site frontend + API)
 * - plain HTTP / development: Lax
 *
 * Strict in development overwrites the Go-issued Lax cookie the first time
 * Node persists a non-student session, and the next reload looks logged out.
 * Production must stay None; Lax here would drop cookies on the real site.
 */
export const defaultSessionSameSite = (isDevelopment) => (isDevelopment ? "lax" : "None")

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
    sameSite: defaultSessionSameSite(env.isDevelopment),
    maxAge: env.SESSION_TTL_SECONDS * 1000,
  },
})

// Create default session config
export const sessionConfig = createSessionConfig()

export default sessionConfig
