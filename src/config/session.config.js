/**
 * Session Configuration
 * Express session and MongoDB store settings
 */
import MongoStore from "connect-mongo"
import { env } from "./env.config.js"

/**
 * Create session configuration
 * Note: Must be called after env is loaded
 */
export const createSessionConfig = () => ({
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: env.MONGO_URI,
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    autoRemove: "native",
    touchAfter: 24 * 3600, // Update session once per 24 hours
    crypto: {
      secret: env.SESSION_SECRET,
    },
  }),
  cookie: {
    httpOnly: true,
    secure: !env.isDevelopment,
    sameSite: env.isDevelopment ? "Strict" : "None",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  },
})

// Create default session config
export const sessionConfig = createSessionConfig()

export default sessionConfig
