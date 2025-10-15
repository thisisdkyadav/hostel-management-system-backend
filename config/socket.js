import { Server } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import Redis from "ioredis"
import { REDIS_URL, ALLOWED_ORIGINS } from "./environment.js"

let io = null
let pubClient = null
let subClient = null

/**
 * Initialize Socket.IO with Redis adapter
 * @param {Object} httpServer - HTTP server instance
 * @returns {Object} Socket.IO server instance
 */
export const initializeSocketIO = (httpServer) => {
  // Create Socket.IO server with CORS configuration and custom path
  io = new Server(httpServer, {
    path: "/socket.io", // Explicit path for nginx proxying
    cors: {
      origin: ALLOWED_ORIGINS.split(","),
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ["websocket", "polling"],
    allowEIO3: true, // Support older clients if needed
  })

  // Initialize Redis clients for pub/sub
  try {
    pubClient = new Redis(REDIS_URL, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000)
        return delay
      },
    })

    subClient = pubClient.duplicate()

    // Setup Redis adapter for Socket.IO
    io.adapter(createAdapter(pubClient, subClient))

    console.log("✓ Socket.IO initialized with Redis adapter")

    // Handle Redis connection errors
    pubClient.on("error", (err) => {
      console.error("Redis Pub Client Error:", err)
    })

    subClient.on("error", (err) => {
      console.error("Redis Sub Client Error:", err)
    })

    pubClient.on("connect", () => {
      console.log("✓ Redis Pub client connected")
    })

    subClient.on("connect", () => {
      console.log("✓ Redis Sub client connected")
    })
  } catch (error) {
    console.error("Failed to initialize Redis adapter:", error)
    console.log("⚠ Socket.IO running without Redis adapter (single server mode)")
  }

  return io
}

/**
 * Get Socket.IO instance
 * @returns {Object} Socket.IO server instance
 */
export const getIO = () => {
  if (!io) {
    throw new Error("Socket.IO not initialized. Call initializeSocketIO first.")
  }
  return io
}

/**
 * Get Redis clients
 * @returns {Object} Redis pub and sub clients
 */
export const getRedisClients = () => {
  return { pubClient, subClient }
}

/**
 * Cleanup function for graceful shutdown
 */
export const closeSocketIO = async () => {
  if (io) {
    io.close()
    console.log("✓ Socket.IO server closed")
  }

  if (pubClient) {
    await pubClient.quit()
    console.log("✓ Redis Pub client disconnected")
  }

  if (subClient) {
    await subClient.quit()
    console.log("✓ Redis Sub client disconnected")
  }
}

export default { initializeSocketIO, getIO, getRedisClients, closeSocketIO }
