import { AppError } from "./AppError.js"

/**
 * Global Error Handler Middleware
 * Catches all errors and returns consistent response
 */
export const errorHandler = (err, req, res, next) => {
  // Log error (will be replaced with proper logger later)
  console.error("Error:", {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
  })

  // If headers already sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err)
  }

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJSON())
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: "Invalid ID format",
      timestamp: new Date().toISOString(),
    })
  }

  // Handle Mongoose Duplicate Key Error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0]
    return res.status(409).json({
      success: false,
      message: `${field ? `${field} already exists` : "Duplicate entry"}`,
      timestamp: new Date().toISOString(),
    })
  }

  // Handle Mongoose Validation Error
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message,
    }))
    return res.status(422).json({
      success: false,
      message: "Validation failed",
      errors,
      timestamp: new Date().toISOString(),
    })
  }

  // Handle JWT Errors
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      success: false,
      message: "Invalid token",
      timestamp: new Date().toISOString(),
    })
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      success: false,
      message: "Token expired",
      timestamp: new Date().toISOString(),
    })
  }

  // Unknown errors - don't expose details in production
  const isDev = process.env.NODE_ENV === "development"
  return res.status(500).json({
    success: false,
    message: isDev ? err.message : "Internal server error",
    ...(isDev && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  })
}

/**
 * 404 Not Found Handler
 * For undefined routes
 */
export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  })
}

export default errorHandler
