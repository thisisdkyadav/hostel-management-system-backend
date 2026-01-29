/**
 * LEGACY FILE - Re-exports from new location
 * TODO: Update all imports to use '../src/config' then delete this file
 * @see src/config/env.config.js
 */
export {
  isDevelopmentEnvironment,
  PORT,
  JWT_SECRET,
  SESSION_SECRET,
  MONGO_URI,
  REDIS_URL,
  AZURE_STORAGE_CONNECTION_STRING,
  AZURE_STORAGE_CONTAINER_NAME,
  AZURE_STORAGE_ACCOUNT_NAME,
  AZURE_STORAGE_ACCOUNT_KEY,
  QR_PRIVATE_KEY,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID,
  ALLOWED_ORIGINS,
  USE_LOCAL_STORAGE,
  env,
} from "../src/config/env.config.js"
