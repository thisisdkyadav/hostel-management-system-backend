import dotenv from "dotenv"

dotenv.config()

export const isDevelopmentEnvironment = process.env.NODE_ENV === "development",
  PORT = process.env.PORT || 5000,
  JWT_SECRET = process.env.JWT_SECRET,
  SESSION_SECRET = process.env.SESSION_SECRET,
  MONGO_URI = process.env.MONGO_URI,
  AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING,
  AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME,
  AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME,
  AZURE_STORAGE_ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY,
  QR_PRIVATE_KEY = process.env.QR_PRIVATE_KEY,
  RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET,
  AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID = process.env.AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID,
  ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS,
  USE_LOCAL_STORAGE = process.env.USE_LOCAL_STORAGE === "true"
