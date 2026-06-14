/**
 * CORS Configuration
 * Cross-Origin Resource Sharing settings
 */
import { env } from "./env.config.js"

/**
 * Default CORS options (with credentials)
 */
export const corsOptions = {
  origin: env.ALLOWED_ORIGINS,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  exposedHeaders: ["set-cookie"],
}

/**
 * Scanner CORS options (public, Basic Auth)
 */
export const scannerCorsOptions = {
  origin: "*",
  credentials: false,
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type", "Authorization"],
}

export default corsOptions
