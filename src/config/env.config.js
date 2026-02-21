/**
 * Environment Configuration
 * Centralized environment variable access with validation
 */
import dotenv from "dotenv"

// Load .env file
dotenv.config()

const parseCsv = (value) => {
  if (!value) return []
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

const parseBoolean = (value, defaultValue = false) => {
  if (value === undefined || value === null || value === "") {
    return defaultValue
  }
  return String(value).trim().toLowerCase() === "true"
}

/**
 * Validate required environment variables
 * @param {string[]} required - List of required env vars
 */
const validateEnv = (required) => {
  const missing = required.filter((key) => !process.env[key])
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`)
    // Don't exit in development to allow partial testing
    if (process.env.NODE_ENV === "production") {
      process.exit(1)
    }
  }
}

// Validate critical env vars
validateEnv(["MONGO_URI", "SESSION_SECRET"])

/**
 * Environment configuration object
 */
export const env = {
  // Node
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: parseInt(process.env.PORT, 10) || 5000,
  isDevelopment: process.env.NODE_ENV === "development",
  isProduction: process.env.NODE_ENV === "production",

  // Database
  MONGO_URI: process.env.MONGO_URI,

  // Redis
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  REDIS_SESSION_PREFIX: process.env.REDIS_SESSION_PREFIX || "sess:",
  SESSION_TTL_SECONDS: parseInt(process.env.SESSION_TTL_SECONDS, 10) || 7 * 24 * 60 * 60,

  // Auth
  JWT_SECRET: process.env.JWT_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,

  // Azure Storage
  azure: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    containerName: process.env.AZURE_STORAGE_CONTAINER_NAME,
    accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
    accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY,
    studentIdContainer: process.env.AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID,
  },

  // QR
  QR_PRIVATE_KEY: process.env.QR_PRIVATE_KEY,

  // CORS
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(",") || [],

  // Storage
  USE_LOCAL_STORAGE: process.env.USE_LOCAL_STORAGE === "true",

  // Email/SMTP
  smtp: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || "HMS <saappsupport@iiti.ac.in>",
  },

  // Frontend URL (for password reset links)
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  // Layer-3 AuthZ mode
  // off     -> middleware no-op
  // observe -> compute only, do not block
  // enforce -> block when rule fails
  AUTHZ_MODE: process.env.AUTHZ_MODE || "observe",
  // Comma-separated route/capability keys that should enforce even in observe mode.
  AUTHZ_ENFORCE_ROUTE_KEYS: parseCsv(process.env.AUTHZ_ENFORCE_ROUTE_KEYS),
  AUTHZ_ENFORCE_CAPABILITY_KEYS: parseCsv(process.env.AUTHZ_ENFORCE_CAPABILITY_KEYS),
  // When true, prints observe-mode deny previews for monitoring rollout risk.
  AUTHZ_OBSERVE_LOG_DENIES: parseBoolean(process.env.AUTHZ_OBSERVE_LOG_DENIES, false),
}

// ============================================
// LEGACY EXPORTS - For backward compatibility
// These match the old config/environment.js exports
// TODO: Update imports to use `env` object instead
// ============================================
export const isDevelopmentEnvironment = env.isDevelopment
export const PORT = env.PORT
export const JWT_SECRET = env.JWT_SECRET
export const SESSION_SECRET = env.SESSION_SECRET
export const MONGO_URI = env.MONGO_URI
export const REDIS_URL = env.REDIS_URL
export const REDIS_SESSION_PREFIX = env.REDIS_SESSION_PREFIX
export const SESSION_TTL_SECONDS = env.SESSION_TTL_SECONDS
export const AZURE_STORAGE_CONNECTION_STRING = env.azure.connectionString
export const AZURE_STORAGE_CONTAINER_NAME = env.azure.containerName
export const AZURE_STORAGE_ACCOUNT_NAME = env.azure.accountName
export const AZURE_STORAGE_ACCOUNT_KEY = env.azure.accountKey
export const QR_PRIVATE_KEY = env.QR_PRIVATE_KEY
export const AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID = env.azure.studentIdContainer
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS // Keep as string for legacy
export const USE_LOCAL_STORAGE = env.USE_LOCAL_STORAGE

export default env
