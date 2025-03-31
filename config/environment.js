import dotenv from "dotenv"

dotenv.config()

export const isDevelopmentEnvironment = process.env.NODE_ENV === "development",
  PORT = process.env.PORT || 5000,
  JWT_SECRET = process.env.JWT_SECRET,
  MONGO_URI = process.env.MONGO_URI,
  AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING,
  AZURE_STORAGE_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME,
  AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME,
  AZURE_STORAGE_ACCOUNT_KEY = process.env.AZURE_STORAGE_ACCOUNT_KEY
