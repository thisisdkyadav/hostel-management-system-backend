import User from "../models/user/User.model.js"
import { getIO } from "../loaders/socket.loader.js"
import { addOnlineUser, removeOnlineUser, updateUserActivity } from "./redisOnlineUsers.js"

/**
 * Setup Socket.IO event handlers
 * @param {Object} io - Socket.IO server instance
 * @param {Object} sessionMiddleware - Express session middleware
 */
export const setupSocketHandlers = (io, sessionMiddleware) => {
  // Use session middleware for Socket.IO authentication
  io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next)
  })

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const session = socket.request.session

      if (!session || !session.userId) {
        return next(new Error("Authentication required"))
      }

      // Fetch user data
      const user = await User.findById(session.userId).select("-password")

      if (!user) {
        return next(new Error("User not found"))
      }

      // Attach user to socket
      socket.userId = user._id
      socket.userRole = user.role
      socket.userEmail = user.email
      socket.userName = user.name
      socket.hostelId = user.hostel?._id || null

      next()
    } catch (error) {
      console.error("Socket authentication error:", error)
      next(new Error("Authentication failed"))
    }
  })

  // Connection handler
  io.on("connection", async (socket) => {
    console.log(`✓ User connected: ${socket.userName} (${socket.userRole}) - Socket ID: ${socket.id}`)

    try {
      // Get device info from handshake
      const deviceInfo = {
        userAgent: socket.handshake.headers["user-agent"] || "Unknown",
        ip: socket.handshake.address || socket.request.connection.remoteAddress,
        platform: socket.handshake.headers["sec-ch-ua-platform"] || "Unknown",
      }

      const connectedAt = new Date()

      // Add to Redis for real-time state (ONLY REDIS - NO MONGODB)
      await addOnlineUser({
        userId: socket.userId,
        socketId: socket.id,
        role: socket.userRole,
        hostelId: socket.hostelId,
        userName: socket.userName,
        userEmail: socket.userEmail,
        connectedAt: connectedAt.toISOString(),
        deviceInfo,
      })

      // Join room based on role
      socket.join(`role:${socket.userRole}`)

      // Join hostel room if applicable
      if (socket.hostelId) {
        socket.join(`hostel:${socket.hostelId}`)
      }

      // Join user-specific room
      socket.join(`user:${socket.userId}`)

      // Emit to admins about new online user
      io.to("role:Admin").to("role:Super Admin").emit("user:online", {
        userId: socket.userId,
        userName: socket.userName,
        role: socket.userRole,
        hostelId: socket.hostelId,
        connectedAt,
      })

      // Send connection success to user
      socket.emit("connected", {
        message: "Connected successfully",
        userId: socket.userId,
        role: socket.userRole,
      })

      // Handle activity heartbeat
      socket.on("activity", async () => {
        try {
          // Update in Redis (ONLY REDIS - NO MONGODB)
          await updateUserActivity(socket.userId.toString())
        } catch (error) {
          console.error("Error updating activity:", error)
        }
      })

      // Handle custom events (placeholder for future features)
      socket.on("message", (data) => {
        console.log(`Message from ${socket.userName}:`, data)
      })

      // Handle disconnection
      socket.on("disconnect", async () => {
        console.log(`✗ User disconnected: ${socket.userName} (${socket.userRole}) - Socket ID: ${socket.id}`)

        try {
          const now = new Date()

          // Remove from Redis (ONLY REDIS - NO MONGODB)
          const userData = await removeOnlineUser(socket.id)

          // Emit to admins about user going offline (only if fully offline)
          if (userData) {
            io.to("role:Admin").to("role:Super Admin").emit("user:offline", {
              userId: socket.userId,
              userName: socket.userName,
              role: socket.userRole,
              hostelId: socket.hostelId,
              disconnectedAt: now,
            })
          }
        } catch (error) {
          console.error("Error handling disconnection:", error)
        }
      })

      // Handle errors
      socket.on("error", (error) => {
        console.error(`Socket error for ${socket.userName}:`, error)
      })
    } catch (error) {
      console.error("Error in connection handler:", error)
      socket.disconnect()
    }
  })

  console.log("✓ Socket.IO event handlers configured")
}

/**
 * Emit event to specific user
 * @param {String} userId - User ID
 * @param {String} event - Event name
 * @param {Object} data - Event data
 */
export const emitToUser = (userId, event, data) => {
  const io = getIO()
  io.to(`user:${userId}`).emit(event, data)
}

/**
 * Emit event to specific role
 * @param {String} role - User role
 * @param {String} event - Event name
 * @param {Object} data - Event data
 */
export const emitToRole = (role, event, data) => {
  const io = getIO()
  io.to(`role:${role}`).emit(event, data)
}

/**
 * Emit event to specific hostel
 * @param {String} hostelId - Hostel ID
 * @param {String} event - Event name
 * @param {Object} data - Event data
 */
export const emitToHostel = (hostelId, event, data) => {
  const io = getIO()
  io.to(`hostel:${hostelId}`).emit(event, data)
}

/**
 * Broadcast to all connected clients
 * @param {String} event - Event name
 * @param {Object} data - Event data
 */
export const broadcastToAll = (event, data) => {
  const io = getIO()
  io.emit(event, data)
}

export default {
  setupSocketHandlers,
  emitToUser,
  emitToRole,
  emitToHostel,
  broadcastToAll,
}
