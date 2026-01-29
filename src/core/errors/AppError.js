/**
 * Base Application Error
 * All custom errors extend this class
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message)
    this.statusCode = statusCode
    this.isOperational = isOperational // Operational errors vs programming errors
    this.timestamp = new Date().toISOString()
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
    }
  }
}

/**
 * 400 Bad Request
 */
export class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(message, 400)
  }
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401)
  }
}

/**
 * 403 Forbidden
 */
export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(message, 403)
  }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404)
  }
}

/**
 * 409 Conflict
 */
export class ConflictError extends AppError {
  constructor(message = "Resource already exists") {
    super(message, 409)
  }
}

/**
 * 422 Validation Error
 */
export class ValidationError extends AppError {
  constructor(message = "Validation failed", errors = []) {
    super(message, 422)
    this.errors = errors
  }

  toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors,
    }
  }
}

/**
 * 429 Too Many Requests
 */
export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429)
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalError extends AppError {
  constructor(message = "Internal server error") {
    super(message, 500, false)
  }
}

export default AppError
