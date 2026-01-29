/**
 * Database Configuration
 * MongoDB connection settings
 */
import mongoose from "mongoose"
import { env } from "./env.config.js"

export const databaseConfig = {
  uri: env.MONGO_URI,
  options: {
    // Mongoose 8.x uses these by default, but explicit for clarity
    autoIndex: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  },
}

/**
 * Connect to MongoDB
 * @returns {Promise<typeof mongoose>}
 */
export const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(databaseConfig.uri, databaseConfig.options)
    console.log(`MongoDB Connected: ${conn.connection.host}`)
    return conn
  } catch (error) {
    console.error("MongoDB connection error:", error.message)
    process.exit(1)
  }
}

// Legacy export name for backward compatibility
export const connectDB = connectDatabase

export default connectDatabase
