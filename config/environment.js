import dotenv from "dotenv"

dotenv.config()

export const isDev = process.env.NODE_ENV === "development",
  PORT = process.env.PORT || 5000,
  JWT_SECRET = process.env.JWT_SECRET
